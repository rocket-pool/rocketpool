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

    // Calculate in percent how much rewards a claimer here can receive 
    function getClaimRewardsPerc(address _trustedNodeAddress) override public view returns (uint256) {
        // Total the trusted node can claim
        uint256 claimTotalPerc = 0;
        // Find out how many trusted nodes there currently are
        RocketNodeManagerInterface nodeManager = RocketNodeManagerInterface(getContractAddress('rocketNodeManager'));
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        // Check to see if any claim intervals have passed, this means no one has made a claim in the new claim interval yet
        uint256 claimedIntervalsPassed = rewardsPool.getClaimIntervalsPassed();
        // Check to see if any other trusted nodes have claimed during this interval
        uint256 claimedContractTotal = rewardsPool.getClaimIntervalContractTotalClaimed(msg.sender);
        // Total trusted nodes to use for calculating rewards perc, if a claim has already been made during this interval, we use the saved amount of trusted nodes
        uint256 trustedNodesClaimIntervalTotal = claimedContractTotal == 0 ? nodeManager.getTrustedNodeCount() : getUintS('claimcontract.trustednodes.total');
        // They can only claim until the next claim interval has started if they are a newly trusted node
        if(claimedIntervalsPassed > 0 || getUint(keccak256(abi.encodePacked("node.trusted.block", _trustedNodeAddress))) <= rewardsPool.getClaimIntervalBlockStart()) {
            // Calculate the perc of the trusted node rewards they are entitled too
            claimTotalPerc = trustedNodesClaimIntervalTotal > 0 ? calcBase.div(trustedNodesClaimIntervalTotal) : 0;
        }
        // Each trusted node is awarded an equal portion of the rewards per claim interval
        return claimTotalPerc;
    }

    // Return how much they can expect in rpl rewards
    function getClaimRewardsAmount() override public view onlyTrustedNode(msg.sender) returns (uint256) {
        // Init the rewards pool contract 
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        return rewardsPool.getClaimAmount(address(this), msg.sender, getClaimRewardsPerc(msg.sender));
    }


    // Trusted node claiming
    function claim() override external onlyTrustedNode(msg.sender) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        // Check if this is the first claim of this claim interval, we'll need to save the total amount of trusted nodes for this claim interval
        uint256 claimedContractTotal = rewardsPool.getClaimIntervalContractTotalClaimed(msg.sender);
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
