pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";
import "../../../interface/rewards/RocketRewardsPoolInterface.sol";
import "../../../interface/rewards/claims/RocketClaimTrustedNodeInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// GGP Rewards claiming for nodes (trusted) and minipool validators
contract RocketClaimTrustedNode is RocketBase, RocketClaimTrustedNodeInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }

    // Determine if this contract is enabled or not for claims
    function getEnabled() override external view returns (bool) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        return rewardsPool.getClaimingContractEnabled("rocketClaimTrustedNode");
    }

    // Determine when this trusted node can claim, only after 1 claim period has passed since they were made a trusted node
    function getClaimPossible(address _trustedNodeAddress) override public view onlyTrustedNode(_trustedNodeAddress) returns (bool) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        // Can we make a claim? have we been registered and registered long enough?
        return rewardsPool.getClaimingContractUserCanClaim("rocketClaimTrustedNode", _trustedNodeAddress);
    }

    // Calculate in percent how much rewards a claimer here can receive 
    function getClaimRewardsPerc(address _trustedNodeAddress) override public view onlyTrustedNode(_trustedNodeAddress) returns (uint256) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        // Get total trusted nodes for this claim interval
        uint256 trustedNodesClaimIntervalTotal = rewardsPool.getClaimingContractUserTotalCurrent("rocketClaimTrustedNode");
        // Edge case for when there are no trusted nodes in the current interval
        if (trustedNodesClaimIntervalTotal == 0) {
            // Use the number of trusted nodes in the next interval instead
            trustedNodesClaimIntervalTotal = rewardsPool.getClaimingContractUserTotalNext("rocketClaimTrustedNode");
        }
        // They can only claim until the next claim interval has started if they are a newly trusted node
        // Calculate the perc of the trusted node rewards they are entitled too
        return getClaimPossible(_trustedNodeAddress) && trustedNodesClaimIntervalTotal > 0 ? calcBase.div(trustedNodesClaimIntervalTotal) : 0;
    }

    // Return how much they can expect in ggp rewards
    function getClaimRewardsAmount(address _trustedNodeAddress) override external view onlyTrustedNode(_trustedNodeAddress) returns (uint256) {
        // Init the rewards pool contract 
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        return rewardsPool.getClaimAmount("rocketClaimTrustedNode", _trustedNodeAddress, getClaimRewardsPerc(_trustedNodeAddress));
    }

    // Trusted node registering to claim
    function register(address _trustedNodeAddress, bool _enable) override external onlyLatestContract("rocketClaimTrustedNode", address(this)) onlyLatestContract("rocketDAONodeTrustedActions", msg.sender) onlyTrustedNode(_trustedNodeAddress) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        // Register/Unregister now
        rewardsPool.registerClaimer(_trustedNodeAddress, _enable);
    }
    
    // Trusted node claiming
    function claim() override external onlyLatestContract("rocketClaimTrustedNode", address(this)) onlyTrustedNode(msg.sender) {
        // Verify this trusted node is able to claim
        require(getClaimPossible(msg.sender), "This trusted node is not able to claim yet and must wait until a full claim interval passes");
        // Get node withdrawal address
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        address nodeWithdrawalAddress = rocketNodeManager.getNodeWithdrawalAddress(msg.sender);
        // Claim GGP
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        rewardsPool.claim(msg.sender, nodeWithdrawalAddress, getClaimRewardsPerc(msg.sender));
    }
    

}
