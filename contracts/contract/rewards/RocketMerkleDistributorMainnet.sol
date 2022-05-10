pragma solidity 0.7.6;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/token/RocketTokenRPLInterface.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/rewards/RocketRewardsRelayInterface.sol";
import "../../interface/rewards/RocketSmoothingPoolInterface.sol";

import "@openzeppelin/contracts/cryptography/MerkleProof.sol";

/*
* On mainnet, the relay and the distributor are the same contract as there is no need for an intermediate contract to
* handle cross-chain messaging.
*/
contract RocketMerkleDistributorMainnet is RocketBase, RocketRewardsRelayInterface {

    // Libs
    using SafeMath for uint;

    // Constants
    uint256 constant network = 0;

    // Allow receiving ETH
    receive() payable external {}

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }

    // Called by RocketRewardsPool to include a snapshot into this distributor
    function relayRewards(uint256 _index, bytes32 _root, uint256 _rewardsRPL, uint256 _rewardsETH) external override onlyLatestContract("rocketMerkleDistributorMainnet", address(this)) onlyLatestContract("rocketRewardsPool", msg.sender) {
        bytes32 key = keccak256(abi.encodePacked('rewards.merkle.root', _index));
        require(getBytes32(key) == bytes32(0));
        setBytes32(key, _root);
    }

    function claim(address _nodeAddress, uint256[] calldata _index, uint256[] calldata _amountRPL, uint256[] calldata _amountETH, bytes32[][] calldata _merkleProof) external override {
        // Validate input
        require(_index.length == _amountRPL.length && _index.length == _amountETH.length && _index.length == _merkleProof.length, "Invalid array lengths");
        // Get contracts
        RocketTokenRPLInterface rocketTokenRPL = RocketTokenRPLInterface(getContractAddress("rocketTokenRPL"));
        // Get withdrawal address
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
        require(msg.sender == _nodeAddress || msg.sender == withdrawalAddress, "Can only claim from node or withdrawal address");
        // Verify claims
        uint256 totalAmountRPL = 0;
        uint256 totalAmountETH = 0;
        for (uint256 i = 0; i < _index.length; i++) {
            _claim(_index[i], _nodeAddress, _amountRPL[i], _amountETH[i], _merkleProof[i]);
            totalAmountRPL = totalAmountRPL.add(_amountRPL[i]);
            totalAmountETH = totalAmountETH.add(_amountETH[i]);
        }
        // Distribute the rewards
        if (totalAmountRPL > 0) {
            rocketTokenRPL.transfer(withdrawalAddress, totalAmountRPL);
        }
        if (totalAmountETH > 0) {
            (bool result,) = withdrawalAddress.call{value: totalAmountETH}("");
            require(result, "Failed to claim ETH");
        }
    }

    function claimAndStake(address _nodeAddress, uint256[] calldata _index, uint256[] calldata _amountRPL, uint256[] calldata _amountETH, bytes32[][] calldata _merkleProof, uint256 _stakeAmount) external override {
        // Check input
        require(_stakeAmount > 0, "Invalid stake amount");
        // Get contracts
        RocketTokenRPLInterface rocketTokenRPL = RocketTokenRPLInterface(getContractAddress("rocketTokenRPL"));
        // Get withdrawal address
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
        require(msg.sender == _nodeAddress || msg.sender == withdrawalAddress, "Can only claim from node or withdrawal address");
        // Verify claims
        for (uint256 i = 0; i < _index.length; i++) {
            _claim(_index[i], _nodeAddress, _amountRPL[i], _amountETH[i], _merkleProof[i]);
        }
        {
            // Calculate totals
            uint256 totalAmountRPL = 0;
            uint256 totalAmountETH = 0;
            for (uint256 i = 0; i < _index.length; i++) {
                totalAmountRPL = totalAmountRPL.add(_amountRPL[i]);
                totalAmountETH = totalAmountETH.add(_amountETH[i]);
            }
            // Validate input
            require(_stakeAmount <= totalAmountRPL, "Invalid stake amount");
            // Distribute any remaining tokens to the node's withdrawal address
            uint256 remaining = totalAmountRPL.sub(_stakeAmount);
            if (remaining > 0) {
                rocketTokenRPL.transfer(withdrawalAddress, remaining);
            }
            // Distribute ETH
            if (totalAmountETH > 0) {
                (bool result,) = withdrawalAddress.call{value: totalAmountETH}("");
                require(result, "Failed to claim ETH");
            }
        }
        // Restake requested amount
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        rocketTokenRPL.approve(address(rocketNodeStaking), _stakeAmount);
        rocketNodeStaking.stakeRPLFor(_nodeAddress, _stakeAmount);
    }

    function _claim(uint256 _index, address _nodeAddress, uint256 _amountRPL, uint256 _amountETH, bytes32[] calldata _merkleProof) internal {
        // Ensure not already claimed
        require(!isClaimed(_index, _nodeAddress), "Already claimed");
        // Prevent accidental claim of 0
        require(_amountRPL > 0 || _amountETH > 0, "Invalid amount");
        // Verify the merkle proof
        bytes32 node = keccak256(abi.encodePacked(_nodeAddress, network, _amountRPL, _amountETH));
        bytes32 key = keccak256(abi.encodePacked('rewards.merkle.root', _index));
        bytes32 merkleRoot = getBytes32(key);
        require(MerkleProof.verify(_merkleProof, merkleRoot, node), "Invalid proof");
        // Mark it claimed and mint
        _setClaimed(_index, _nodeAddress);
    }

    function isClaimed(uint256 _index, address _claimer) public override view returns (bool) {
        uint256 indexWordIndex = _index / 256;
        uint256 indexBitIndex = _index % 256;
        uint256 claimedWord = getUint(keccak256(abi.encodePacked('rewards.interval.claimed', _claimer, indexWordIndex)));
        uint256 mask = (1 << indexBitIndex);
        return claimedWord & mask == mask;
    }

    function _setClaimed(uint256 _index, address _claimer) internal {
        uint256 indexWordIndex = _index / 256;
        uint256 indexBitIndex = _index % 256;
        bytes32 key = keccak256(abi.encodePacked('rewards.interval.claimed', _claimer, indexWordIndex));
        uint256 bitmap = getUint(key);
        bitmap = bitmap | (1 << indexBitIndex);
        setUint(key, bitmap);
    }
}
