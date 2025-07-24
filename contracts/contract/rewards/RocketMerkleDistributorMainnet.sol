// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../RocketBase.sol";
import "../../interface/token/RocketTokenRPLInterface.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/rewards/RocketRewardsRelayInterface.sol";
import "../../interface/rewards/RocketSmoothingPoolInterface.sol";
import "../../interface/RocketVaultWithdrawerInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/rewards/RocketMerkleDistributorMainnetInterface.sol";

import "@openzeppelin4/contracts/utils/cryptography/MerkleProof.sol";

/// @dev On mainnet, the relay and the distributor are the same contract as there is no need for an intermediate contract to
///      handle cross-chain messaging.
contract RocketMerkleDistributorMainnet is RocketBase, RocketMerkleDistributorMainnetInterface, RocketVaultWithdrawerInterface {
    // Events
    event RewardsClaimed(address indexed claimer, Claim[] claims);

    // Constants
    uint256 constant network = 0;

    // Immutables
    bytes32 immutable rocketVaultKey;
    bytes32 immutable rocketTokenRPLKey;

    // Allow receiving ETH
    receive() payable external {}

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 3;
        // Precompute keys
        rocketVaultKey = keccak256(abi.encodePacked("contract.address", "rocketVault"));
        rocketTokenRPLKey = keccak256(abi.encodePacked("contract.address", "rocketTokenRPL"));
    }

    /// @notice Used following an upgrade or new deployment to initialise the delegate list
    function initialise() external override {
        // On new deploy, allow guardian to initialise, otherwise, only a network contract
        if (rocketStorage.getDeployedStatus()) {
            require(getBool(keccak256(abi.encodePacked("contract.exists", msg.sender))), "Invalid or outdated network contract");
        } else {
            require(msg.sender == rocketStorage.getGuardian(), "Not guardian");
        }
        // Set this contract as the relay for network 0
        setAddress(keccak256(abi.encodePacked("rewards.relay.address", uint256(0))), address(this));
    }

    /// @notice Called by RocketRewardsPool to include a snapshot into this distributor
    function relayRewards(uint256 _rewardIndex, bytes32 _root, uint256 _rewardsRPL, uint256 _rewardsETH) external override onlyLatestContract("rocketMerkleDistributorMainnet", address(this)) onlyLatestContract("rocketRewardsPool", msg.sender) {
        bytes32 key = keccak256(abi.encodePacked('rewards.merkle.root', _rewardIndex));
        require(getBytes32(key) == bytes32(0));
        setBytes32(key, _root);
        // Send the ETH and RPL to the vault
        RocketVaultInterface rocketVault = RocketVaultInterface(getAddress(rocketVaultKey));
        if (_rewardsETH > 0) {
            rocketVault.depositEther{value: _rewardsETH}();
        }
        if (_rewardsRPL > 0) {
            IERC20 rocketTokenRPL = IERC20(getAddress(rocketTokenRPLKey));
            rocketTokenRPL.approve(address(rocketVault), _rewardsRPL);
            rocketVault.depositToken("rocketMerkleDistributorMainnet", rocketTokenRPL, _rewardsRPL);
        }
    }

    /// @notice Reward recipients can call this method with a merkle proof to claim rewards for one or more reward intervals
    function claim(address _nodeAddress, Claim[] calldata _claims) external override {
        claimAndStake(_nodeAddress, _claims, 0);
    }

    /// @notice Reward recipients can call this method to claim rewards for one or more reward intervals and immediately stake some or all of the claimed RPL
    function claimAndStake(address _nodeAddress, Claim[] calldata _claims, uint256 _stakeAmount) public override {
        _verifyClaim(_nodeAddress, _claims);
        _claimAndStake(_nodeAddress, _claims, _stakeAmount);
    }

    /// @notice Node operators can call this method to claim rewards for one or more reward intervals and specify an amount of RPL to stake at the same time
    function _claimAndStake(address _nodeAddress, Claim[] calldata _claims, uint256 _stakeAmount) internal {
        // Get contracts
        RocketVaultInterface rocketVault = RocketVaultInterface(getAddress(rocketVaultKey));

        address rplWithdrawalAddress;
        address withdrawalAddress;

        // Confirm caller is permitted
        {
            RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
            rplWithdrawalAddress = rocketNodeManager.getNodeRPLWithdrawalAddress(_nodeAddress);
            withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
            if (rocketNodeManager.getNodeRPLWithdrawalAddressIsSet(_nodeAddress)) {
                if (_stakeAmount > 0) {
                    // If staking and RPL withdrawal address is set, must be called from RPL withdrawal address
                    require(msg.sender == rplWithdrawalAddress, "Can only claim and stake from RPL withdrawal address");
                } else {
                    // Otherwise, must be called from RPL withdrawal address, node address or withdrawal address
                    require(msg.sender == rplWithdrawalAddress || msg.sender == _nodeAddress || msg.sender == withdrawalAddress, "Can only claim from withdrawal addresses or node address");
                }
            } else {
                // If RPL withdrawal address isn't set, must be called from node address or withdrawal address
                require(msg.sender == _nodeAddress || msg.sender == withdrawalAddress, "Can only claim from node address");
            }
        }

        address rocketTokenRPLAddress = getAddress(rocketTokenRPLKey);

        // Calculate totals
        {
            uint256 totalAmountRPL = 0;
            uint256 totalAmountSmoothingPoolETH = 0;
            uint256 totalAmountVoterETH = 0;
            for (uint256 i = 0; i < _claims.length; ++i) {
                totalAmountRPL = totalAmountRPL + _claims[i].amountRPL;
                totalAmountSmoothingPoolETH = totalAmountSmoothingPoolETH + _claims[i].amountSmoothingPoolETH;
                totalAmountVoterETH = totalAmountVoterETH + _claims[i].amountVoterETH;
            }
            // Validate input
            require(_stakeAmount <= totalAmountRPL, "Invalid stake amount");
            {
                // Distribute any remaining tokens to the node's withdrawal address
                uint256 remaining = totalAmountRPL - _stakeAmount;
                if (remaining > 0) {
                    rocketVault.withdrawToken(rplWithdrawalAddress, IERC20(rocketTokenRPLAddress), remaining);
                }
            }
            // Distribute ETH
            if (totalAmountSmoothingPoolETH + totalAmountVoterETH > 0) {
                rocketVault.withdrawEther(totalAmountSmoothingPoolETH + totalAmountVoterETH);
                if (totalAmountSmoothingPoolETH > 0) {
                    // Allow up to 10000 gas to send ETH to the withdrawal address
                    (bool result,) = withdrawalAddress.call{value: totalAmountSmoothingPoolETH, gas: 10000}("");
                    if (!result) {
                        // If the withdrawal address cannot accept the ETH with 10000 gas, add it to their balance to be claimed later at their own expense
                        bytes32 balanceKey = keccak256(abi.encodePacked('rewards.eth.balance', withdrawalAddress));
                        addUint(balanceKey, totalAmountSmoothingPoolETH);
                        // Return the ETH to the vault
                        rocketVault.depositEther{value: totalAmountSmoothingPoolETH}();
                    }
                }
                if (totalAmountVoterETH > 0) {
                    // Allow up to 10000 gas to send ETH to the RPL withdrawal address
                    (bool result,) = rplWithdrawalAddress.call{value: totalAmountVoterETH, gas: 10000}("");
                    if (!result) {
                        // If the RPL withdrawal address cannot accept the ETH with 10000 gas, add it to their balance to be claimed later at their own expense
                        bytes32 balanceKey = keccak256(abi.encodePacked('rewards.eth.balance', rplWithdrawalAddress));
                        addUint(balanceKey, totalAmountVoterETH);
                        // Return the ETH to the vault
                        rocketVault.depositEther{value: totalAmountVoterETH}();
                    }
                }
            }
        }

        // Restake requested amount
        if (_stakeAmount > 0) {
            RocketTokenRPLInterface rocketTokenRPL = RocketTokenRPLInterface(rocketTokenRPLAddress);
            RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
            rocketVault.withdrawToken(address(this), IERC20(rocketTokenRPLAddress), _stakeAmount);
            rocketTokenRPL.approve(address(rocketNodeStaking), _stakeAmount);
            rocketNodeStaking.stakeRPLFor(_nodeAddress, _stakeAmount);
        }

        // Emit event
        emit RewardsClaimed(_nodeAddress, _claims);
    }

    /// @notice If ETH was claimed but was unable to be sent to the withdrawal address, it can be claimed via this function
    function claimOutstandingEth() external override {
        // Get contracts
        RocketVaultInterface rocketVault = RocketVaultInterface(getAddress(rocketVaultKey));
        // Get the amount and zero it out
        bytes32 balanceKey = keccak256(abi.encodePacked('rewards.eth.balance', msg.sender));
        uint256 amount = getUint(balanceKey);
        setUint(balanceKey, 0);
        // Withdraw the ETH from the vault
        rocketVault.withdrawEther(amount);
        // Attempt to send it to the caller
        (bool result,) = payable(msg.sender).call{value: amount}("");
        require(result, 'Transfer failed');
    }

    /// @notice Returns the amount of ETH that can be claimed by a withdrawal address
    function getOutstandingEth(address _address) external override view returns (uint256) {
        bytes32 balanceKey = keccak256(abi.encodePacked('rewards.eth.balance', _address));
        return getUint(balanceKey);
    }

    /// @notice Verifies the given data exists as a leaf nodes for the specified reward interval and marks them as claimed if they are valid
    /// @dev This function is optimised for gas when _rewardIndex is ordered numerically
    function _verifyClaim(address _nodeAddress, Claim[] calldata _claim) internal {
        // Set initial parameters to the first reward index in the array
        uint256 indexWordIndex = _claim[0].rewardIndex / 256;
        bytes32 claimedWordKey = keccak256(abi.encodePacked('rewards.interval.claimed', _nodeAddress, indexWordIndex));
        uint256 claimedWord = getUint(claimedWordKey);
        // Loop over every entry
        for (uint256 i = 0; i < _claim.length; ++i) {
            // Prevent accidental claim of 0
            require(_claim[i].amountRPL > 0 || _claim[i].amountSmoothingPoolETH > 0 || _claim[i].amountVoterETH > 0, "Invalid amount");
            // Check if this entry has a different word index than the previous
            if (indexWordIndex != _claim[i].rewardIndex / 256) {
                // Store the previous word
                setUint(claimedWordKey, claimedWord);
                // Load the word for this entry
                indexWordIndex = _claim[i].rewardIndex / 256;
                claimedWordKey = keccak256(abi.encodePacked('rewards.interval.claimed', _nodeAddress, indexWordIndex));
                claimedWord = getUint(claimedWordKey);
            }
            // Calculate the bit index for this entry
            uint256 indexBitIndex = _claim[i].rewardIndex % 256;
            // Ensure the bit is not yet set on this word
            uint256 mask = (1 << indexBitIndex);
            require(claimedWord & mask != mask, "Already claimed");
            // Verify the merkle proof
            require(_verifyProof(_nodeAddress, _claim[i]), "Invalid proof");
            // Set the bit for the current reward index
            claimedWord = claimedWord | (1 << indexBitIndex);
        }
        // Store the word
        setUint(claimedWordKey, claimedWord);
    }

    /// @notice Verifies that the given proof is valid
    function _verifyProof(address _nodeAddress, Claim calldata _claim) internal view returns (bool) {
        bytes32 node = keccak256(abi.encodePacked(_nodeAddress, network, _claim.amountRPL, _claim.amountSmoothingPoolETH, _claim.amountVoterETH));
        bytes32 key = keccak256(abi.encodePacked('rewards.merkle.root', _claim.rewardIndex));
        bytes32 merkleRoot = getBytes32(key);
        return MerkleProof.verify(_claim.merkleProof, merkleRoot, node);
    }

    /// @notice Returns true if the given claimer has claimed for the given reward interval
    function isClaimed(uint256 _rewardIndex, address _claimer) public override view returns (bool) {
        uint256 indexWordIndex = _rewardIndex / 256;
        uint256 indexBitIndex = _rewardIndex % 256;
        uint256 claimedWord = getUint(keccak256(abi.encodePacked('rewards.interval.claimed', _claimer, indexWordIndex)));
        uint256 mask = (1 << indexBitIndex);
        return claimedWord & mask == mask;
    }

    /// @notice Allow receiving ETH from RocketVault, no action required
    function receiveVaultWithdrawalETH() external override payable {}
}
