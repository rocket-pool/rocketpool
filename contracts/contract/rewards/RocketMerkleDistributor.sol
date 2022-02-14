pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";
import "../../interface/token/RocketTokenRPLInterface.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";

contract RocketMerkleDistributor is RocketBase {

    // Libs
    using SafeMath for uint;

    // Immutable constants
    uint256 constant network = 0;
    RocketTokenRPLInterface immutable rocketTokenRPL;

    // Merkle tree mappings
    mapping(uint256 => bytes32) public merkleRoots;
    mapping(uint256 => mapping(uint256 => uint256)) private claimedBitMap;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
        // Store rETH address as immutable constant
        rocketTokenRPL = getContractAddress("rocketTokenRPL");
    }

    function addReward(uint256 _block, bytes32 _root, uint256 _total) external onlyLatestContract("rocketMerkleDistributor", address(this)) onlyLatestContract("rocketRewardsPool", msg.sender) {
        merkleRoots[_block] = _root;
    }

    function claim(uint256 _block, uint256 _index, address _nodeAddress, uint256 _amount, bytes32[] calldata _merkleProof) external {
        // Verify claim
        _claim(_block, _index, _nodeAddress, _amount, _merkleProof);
        // Distribute the reward
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
        rocketTokenRPL.transfer(withdrawalAddress, _amount);
    }

    function claimAndStake(uint256 _block, uint256 _index, address _nodeAddress, uint256 _amount, bytes32[] calldata _merkleProof, uint256 _stakeAmount) external {
        // Validate input
        require(_stakeAmount <= _amount, "Invalid stake amount");
        // Verify claim
        _claim(_block, _index, _nodeAddress, _amount, _merkleProof);
        // Get contracts
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        // Distribute any remaining tokens to withdrawal address
        uint256 remaining = _amount.sub(_stakeAmount);
        if (remaining > 0) {
            address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
            rocketTokenRPL.transfer(withdrawalAddress, remaining);
        }
        // Restake requested amount
        rocketTokenRPL.approve(address(rocketNodeStaking), _stakeAmount);
        rocketNodeStaking.stakeRPLFor(_nodeAddress, _stakeAmount);
    }

    function _claim(uint256 _block, uint256 _index, address _nodeAddress, uint256 _amount, bytes32[] calldata _merkleProof) internal {
        // Ensure not already claimed
        require(!isClaimed(_block, _index), "Already claimed");
        // Prevent accidental claim of 0
        require(_amount > 0, "Invalid amount");
        // Verify the merkle proof
        bytes32 node = keccak256(abi.encodePacked(_index, _nodeAddress, network, _amount));
        bytes32 merkleRoot = merkleRoots[_block];
        require(MerkleProof.verify(_merkleProof, merkleRoot, node), "Invalid proof");
        // Mark it claimed and mint
        _setClaimed(_index);
    }

    function isClaimed(uint256 _block, uint256 _index) public view returns (bool) {
        uint256 claimedWordIndex = _index / 256;
        uint256 claimedBitIndex = _index % 256;
        uint256 claimedWord = claimedBitMap[_block][claimedWordIndex];
        uint256 mask = (1 << claimedBitIndex);
        return claimedWord & mask == mask;
    }

    function _setClaimed(uint256 _block, uint256 _index) internal {
        uint256 claimedWordIndex = _index / 256;
        uint256 claimedBitIndex = _index % 256;
        claimedBitMap[_block][claimedWordIndex] = claimedBitMap[_block][claimedWordIndex] | (1 << claimedBitIndex);
    }
}
