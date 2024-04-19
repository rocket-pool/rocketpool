// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../RocketBase.sol";
import "../../interface/token/RocketTokenRPLInterface.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/rewards/RocketRewardsRelayInterface.sol";
import "../../interface/rewards/RocketSmoothingPoolInterface.sol";
import "../../interface/RocketVaultWithdrawerInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";

import "@openzeppelin4/contracts/utils/cryptography/MerkleProof.sol";

/// @dev On mainnet, the relay and the distributor are the same contract as there is no need for an intermediate contract to
///      handle cross-chain messaging.
contract RocketMerkleDistributorMainnet is RocketBase, RocketRewardsRelayInterface, RocketVaultWithdrawerInterface {

    // Events
    event RewardsClaimed(address indexed claimer, uint256[] rewardIndex, uint256[] amountRPL, uint256[] amountETH);

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
        version = 2;
        // Precompute keys
        rocketVaultKey = keccak256(abi.encodePacked("contract.address", "rocketVault"));
        rocketTokenRPLKey = keccak256(abi.encodePacked("contract.address", "rocketTokenRPL"));
    }

    // Called by RocketRewardsPool to include a snapshot into this distributor
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

    // Reward recipients can call this method with a merkle proof to claim rewards for one or more reward intervals
    function claim(address _nodeAddress, uint256[] calldata _rewardIndex, uint256[] calldata _amountRPL, uint256[] calldata _amountETH, bytes32[][] calldata _merkleProof) external override {
        claimAndStake(_nodeAddress, _rewardIndex, _amountRPL, _amountETH, _merkleProof, 0);
    }

    function claimAndStake(address _nodeAddress, uint256[] calldata _rewardIndex, uint256[] calldata _amountRPL, uint256[] calldata _amountETH, bytes32[][] calldata _merkleProof, uint256 _stakeAmount) public override {
        _verifyClaim(_rewardIndex, _nodeAddress, _amountRPL, _amountETH, _merkleProof);
        _claimAndStake(_nodeAddress, _rewardIndex, _amountRPL, _amountETH, _stakeAmount);
    }

    // Node operators can call this method to claim rewards for one or more reward intervals and specify an amount of RPL to stake at the same time
    function _claimAndStake(address _nodeAddress, uint256[] calldata _rewardIndex, uint256[] calldata _amountRPL, uint256[] calldata _amountETH, uint256 _stakeAmount) internal {
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
                // If RPL withdrawal address is set, must be called from it
                require(msg.sender == rplWithdrawalAddress, "Can only claim from RPL withdrawal address");
            } else {
                // Otherwise, must be called from node address or withdrawal address
                address senderWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(msg.sender);
                require(msg.sender == _nodeAddress || msg.sender == withdrawalAddress || senderWithdrawalAddress == _nodeAddress, "Can only claim from node address");
            }
        }

        address rocketTokenRPLAddress = getAddress(rocketTokenRPLKey);

        // Calculate totals
        {
            uint256 totalAmountRPL = 0;
            uint256 totalAmountETH = 0;
            for (uint256 i = 0; i < _rewardIndex.length; ++i) {
                totalAmountRPL = totalAmountRPL + _amountRPL[i];
                totalAmountETH = totalAmountETH + _amountETH[i];
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
            if (totalAmountETH > 0) {
                rocketVault.withdrawEther(totalAmountETH);
                (bool result,) = withdrawalAddress.call{value: totalAmountETH}("");
                require(result, "Failed to claim ETH");
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
        emit RewardsClaimed(_nodeAddress, _rewardIndex, _amountRPL, _amountETH);
    }

    // Verifies the given data exists as a leaf nodes for the specified reward interval and marks them as claimed if they are valid
    // Note: this function is optimised for gas when _rewardIndex is ordered numerically
    function _verifyClaim(uint256[] calldata _rewardIndex, address _nodeAddress, uint256[] calldata _amountRPL, uint256[] calldata _amountETH, bytes32[][] calldata _merkleProof) internal {
        // Set initial parameters to the first reward index in the array
        uint256 indexWordIndex = _rewardIndex[0] / 256;
        bytes32 claimedWordKey = keccak256(abi.encodePacked('rewards.interval.claimed', _nodeAddress, indexWordIndex));
        uint256 claimedWord = getUint(claimedWordKey);
        // Loop over every entry
        for (uint256 i = 0; i < _rewardIndex.length; ++i) {
            // Prevent accidental claim of 0
            require(_amountRPL[i] > 0 || _amountETH[i] > 0, "Invalid amount");
            // Check if this entry has a different word index than the previous
            if (indexWordIndex != _rewardIndex[i] / 256) {
                // Store the previous word
                setUint(claimedWordKey, claimedWord);
                // Load the word for this entry
                indexWordIndex = _rewardIndex[i] / 256;
                claimedWordKey = keccak256(abi.encodePacked('rewards.interval.claimed', _nodeAddress, indexWordIndex));
                claimedWord = getUint(claimedWordKey);
            }
            // Calculate the bit index for this entry
            uint256 indexBitIndex = _rewardIndex[i] % 256;
            // Ensure the bit is not yet set on this word
            uint256 mask = (1 << indexBitIndex);
            require(claimedWord & mask != mask, "Already claimed");
            // Verify the merkle proof
            require(_verifyProof(_rewardIndex[i], _nodeAddress, _amountRPL[i], _amountETH[i], _merkleProof[i]), "Invalid proof");
            // Set the bit for the current reward index
            claimedWord = claimedWord | (1 << indexBitIndex);
        }
        // Store the word
        setUint(claimedWordKey, claimedWord);
    }

    // Verifies that the
    function _verifyProof(uint256 _rewardIndex, address _nodeAddress, uint256 _amountRPL, uint256 _amountETH, bytes32[] calldata _merkleProof) internal view returns (bool) {
        bytes32 node = keccak256(abi.encodePacked(_nodeAddress, network, _amountRPL, _amountETH));
        bytes32 key = keccak256(abi.encodePacked('rewards.merkle.root', _rewardIndex));
        bytes32 merkleRoot = getBytes32(key);
        return MerkleProof.verify(_merkleProof, merkleRoot, node);
    }

    // Returns true if the given claimer has claimed for the given reward interval
    function isClaimed(uint256 _rewardIndex, address _claimer) public override view returns (bool) {
        uint256 indexWordIndex = _rewardIndex / 256;
        uint256 indexBitIndex = _rewardIndex % 256;
        uint256 claimedWord = getUint(keccak256(abi.encodePacked('rewards.interval.claimed', _claimer, indexWordIndex)));
        uint256 mask = (1 << indexBitIndex);
        return claimedWord & mask == mask;
    }

    // Allow receiving ETH from RocketVault, no action required
    function receiveVaultWithdrawalETH() external override payable {}
}
