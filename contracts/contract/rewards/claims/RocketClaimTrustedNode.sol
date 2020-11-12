pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/rewards/RocketRewardsPoolInterface.sol";
import "../../../interface/rewards/claims/RocketRewardsClaimTrustedNodeInterface.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// RPL Rewards claiming for nodes (trusted) and minipool validators
contract RocketClaimTrustedNode is RocketBase, RocketRewardsClaimTrustedNodeInterface {

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // Libs
    using SafeMath for uint;


    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    // Total trusted nodes to use for calculating rewards perc, if a claim has already been made during this interval, we use the saved amount of trusted nodes
    function getClaimIntervalTrustedNodeTotal() override public view returns (uint256) {
        // Find out how many trusted nodes there currently are 
        RocketNodeManagerInterface nodeManager = RocketNodeManagerInterface(getContractAddress('rocketNodeManager'));
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        // Total trusted nodes to use for calculating rewards perc, if a claim has already been made during this interval, we use the saved amount of trusted nodes
        return rewardsPool.getClaimIntervalContractTotalClaimed(address(this)) == 0 ? nodeManager.getTrustedNodeCount() : getUintS('claimcontract.trustednodes.total');
    }

    // Determine when this trusted node can claim, only after 1 claim period has passed since they were made a trusted node
    function getClaimPossible(address _trustedNodeAddress) override public view onlyTrustedNode(_trustedNodeAddress) returns (bool) {
        // Init the node manager contract
        RocketNodeManagerInterface nodeManager = RocketNodeManagerInterface(getContractAddress('rocketNodeManager'));
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        // Check to see if any other trusted nodes have claimed during this interval
        uint256 claimedContractTotal = rewardsPool.getClaimIntervalContractTotalClaimed(address(this));
        // Now if an interval has passed, it means no one from any claims contract has made a claim yet, so good to go 
        // If no intervals have passed yet, they need to wait until the next one as they are a new trusted node
        return claimedContractTotal == 0 || nodeManager.getNodeTrustedBlock(_trustedNodeAddress) <= rewardsPool.getClaimIntervalBlockStart();
    }

    // Calculate in percent how much rewards a claimer here can receive 
    function getClaimRewardsPerc(address _trustedNodeAddress) override public view onlyTrustedNode(_trustedNodeAddress) returns (uint256) {
        // Get total trusted nodes for this claim interval
        uint256 trustedNodesClaimIntervalTotal = getClaimIntervalTrustedNodeTotal();
        // They can only claim until the next claim interval has started if they are a newly trusted node
        // Calculate the perc of the trusted node rewards they are entitled too
        return getClaimPossible(_trustedNodeAddress) && trustedNodesClaimIntervalTotal > 0 ? calcBase.div(trustedNodesClaimIntervalTotal) : 0;
    }

    // Return how much they can expect in rpl rewards
    function getClaimRewardsAmount() override public view onlyTrustedNode(msg.sender) returns (uint256) {
        // Init the rewards pool contract 
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        return rewardsPool.getClaimAmount(address(this), msg.sender, getClaimRewardsPerc(msg.sender));
    }


    // Trusted node claiming
    function claim() override external onlyTrustedNode(msg.sender) {
        // Verify this trusted node is able to claim
        require(getClaimPossible(msg.sender), "This trusted node is not able to claim yet and must wait until the next claim interval starts");
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        // Check if this is the first claim of this claim interval, we'll need to save the total amount of trusted nodes for this claim interval
        uint256 claimedContractTotal = rewardsPool.getClaimIntervalContractTotalClaimed(address(this));
        // If it's 0, no claims have been made, so store the amount of trusted nodes to be used for this interval
        if(claimedContractTotal == 0) {
            // Find out how many trusted nodes there currently are
            RocketNodeManagerInterface nodeManager = RocketNodeManagerInterface(getContractAddress('rocketNodeManager'));
            // Save it for this claim interval
            setUintS('claimcontract.trustednodes.total', nodeManager.getTrustedNodeCount());
        }
        // Attempt to make a claim, will throw if not allowed yet or conditions aren't met
        rewardsPool.claim(msg.sender, getClaimRewardsPerc(msg.sender));
    }
    

}
