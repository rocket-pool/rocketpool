pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/rewards/RocketRewardsPoolInterface.sol";
import "../../../interface/rewards/claims/RocketClaimTrustedNodeInterface.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// RPL Rewards claiming for nodes (trusted) and minipool validators
contract RocketClaimTrustedNode is RocketBase, RocketClaimTrustedNodeInterface {

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    // Determine if this contract is enabled or not for claims
    function getEnabled() override public view returns (bool) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        return rewardsPool.getClaimingContractEnabled('rocketClaimTrustedNode');
    }

    // Determine when this trusted node can claim, only after 1 claim period has passed since they were made a trusted node
    function getClaimPossible(address _trustedNodeAddress) override public view onlyTrustedNode(_trustedNodeAddress) returns (bool) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        // Can we make a claim? have we been registered and registered long enough?
        return rewardsPool.getClaimingContractUserCanClaim('rocketClaimTrustedNode', _trustedNodeAddress);
    }

    // Calculate in percent how much rewards a claimer here can receive 
    function getClaimRewardsPerc(address _trustedNodeAddress) override public view onlyTrustedNode(_trustedNodeAddress) returns (uint256) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        // Get total trusted nodes for this claim interval
        uint256 trustedNodesClaimIntervalTotal = rewardsPool.getClaimingContractUserTotalCurrent('rocketClaimTrustedNode');
        // They can only claim until the next claim interval has started if they are a newly trusted node
        // Calculate the perc of the trusted node rewards they are entitled too
        return getClaimPossible(_trustedNodeAddress) && trustedNodesClaimIntervalTotal > 0 ? calcBase.div(trustedNodesClaimIntervalTotal) : 0;
    }

    // Return how much they can expect in rpl rewards
    function getClaimRewardsAmount() override public view onlyTrustedNode(msg.sender) returns (uint256) {
        // Init the rewards pool contract 
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        return rewardsPool.getClaimAmount('rocketClaimTrustedNode', msg.sender, getClaimRewardsPerc(msg.sender));
    }

    // Trusted node registering to claim
    function register(address _trustedNode, bool _enable) override external onlyTrustedNode(_trustedNode) onlyLatestContract("rocketNodeManager", msg.sender) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        // Register/Unregister now
        rewardsPool.registerClaimer(_trustedNode, _enable);
    }
    
    // Trusted node claiming
    function claim() override external onlyTrustedNode(msg.sender) {
        // Verify this trusted node is able to claim
        require(getClaimPossible(msg.sender), "This trusted node is not able to claim yet and must wait until a full claim interval passes");
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        // Attempt to make a claim, will throw if not allowed yet or conditions aren't met
        rewardsPool.claim(msg.sender, getClaimRewardsPerc(msg.sender));
    }
    

}
