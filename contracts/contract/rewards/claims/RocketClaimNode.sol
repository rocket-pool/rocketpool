pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../../RocketBase.sol";
import "../../../interface/node/RocketNodeStakingInterface.sol";
import "../../../interface/rewards/RocketRewardsPoolInterface.sol";
import "../../../interface/rewards/claims/RocketClaimNodeInterface.sol";

// RPL Rewards claiming for regular nodes

contract RocketClaimNode is RocketBase, RocketClaimNodeInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get whether the contract is enabled for claims
    function getEnabled() override public view returns (bool) {
        RocketRewardsPoolInterface rocketRewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        return rocketRewardsPool.getClaimingContractEnabled("rocketClaimNode");
    }

    // Get whether a node can make a claim
    function getClaimPossible(address _nodeAddress) override public view onlyRegisteredNode(_nodeAddress) returns (bool) {
        RocketRewardsPoolInterface rocketRewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        return rocketRewardsPool.getClaimingContractUserCanClaim("rocketClaimNode", _nodeAddress);
    }

    // Get the share of rewards for a node as a fraction of 1 ether
    function getClaimRewardsPerc(address _nodeAddress) override public view onlyRegisteredNode(_nodeAddress) returns (uint256) {
        // Check node can claim
        if (!getClaimPossible(_nodeAddress)) { return 0; }
        // Load contracts
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        // Calculate and return share
        uint256 calcBase = 1 ether;
        uint256 totalRplStake = rocketNodeStaking.getTotalEffectiveRPLStake();
        if (totalRplStake == 0) { return 0; }
        return calcBase.mul(rocketNodeStaking.getNodeEffectiveRPLStake(_nodeAddress)).div(totalRplStake);
    }

    // Get the amount of rewards for a node for the reward period
    function getClaimRewardsAmount(address _nodeAddress) override public view onlyRegisteredNode(_nodeAddress) returns (uint256) {
        RocketRewardsPoolInterface rocketRewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        return rocketRewardsPool.getClaimAmount("rocketClaimNode", _nodeAddress, getClaimRewardsPerc(_nodeAddress));
    }

    // Register or deregister a node for RPL claims
    // Only accepts calls from the RocketNodeManager contract
    function register(address _nodeAddress, bool _enable) override external onlyLatestContract("rocketClaimNode", address(this)) onlyLatestContract("rocketNodeManager", msg.sender) onlyRegisteredNode(_nodeAddress) {
        RocketRewardsPoolInterface rocketRewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        rocketRewardsPool.registerClaimer(_nodeAddress, _enable);
    }

    // Make an RPL claim
    // Only accepts calls from registered nodes
    function claim() override external onlyLatestContract("rocketClaimNode", address(this)) onlyRegisteredNode(msg.sender) {
        // Check that the node can claim
        require(getClaimPossible(msg.sender), "The node is currently unable to claim");
        // Claim RPL
        RocketRewardsPoolInterface rocketRewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        rocketRewardsPool.claim(msg.sender, getClaimRewardsPerc(msg.sender));
    }

}
