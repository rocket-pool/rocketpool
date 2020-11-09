pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/rewards/RocketRewardsPoolInterface.sol";
import "../../../interface/rewards/claims/RocketRewardsClaimTrustedNodeInterface.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// RPL Rewards claiming for nodes (trusted) and minipool validators
contract RocketClaimTrustedNode is RocketBase, RocketRewardsClaimTrustedNodeInterface {

    // Libs
    using SafeMath for uint;


    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    // Calculate in percent how much rewards a claimer here can receive 
    function getRewardPerc() private view returns (uint256) {
        // Find out how many trusted nodes there currently are
        RocketNodeManagerInterface nodeManager = RocketNodeManagerInterface(getContractAddress('rocketNodeManager'));
        // Calculate using this as the base
        uint256 calcBase = 1 ether;
        // Each trusted node is awarded an equal portion of the rewards per claim interval
        return calcBase.div(nodeManager.getTrustedNodeCount());
    }

    // Get an estimate of the amount this contracts claimer can get
    function getClaimAmount() override view external onlyTrustedNode(msg.sender) returns (uint256) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        return rewardsPool.getClaimAmount(address(this), msg.sender, getRewardPerc()); 
    }

    // Trusted node claiming
    function claim() override external onlyTrustedNode(msg.sender) {
        // Amount this claimer is entitled too
        uint256 claimerAmount = 0.1 ether;
        // Attempt to make a claim, will throw if not allowed yet
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        rewardsPool.claim(msg.sender, claimerAmount);
    }
    

}
