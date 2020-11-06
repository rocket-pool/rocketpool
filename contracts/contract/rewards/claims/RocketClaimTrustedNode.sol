pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/rewards/RocketRewardsPoolInterface.sol";
import "../../../interface/rewards/claims/RocketRewardsClaimTrustedNodeInterface.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


// RPL Rewards claiming for nodes (trusted) and minipool validators
contract RocketClaimTrustedNode is RocketBase, RocketRewardsClaimTrustedNodeInterface {

    // Contracts
    RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(0);

    // Events
    // event RPLTokensDeposited(uint256 amount, uint256 time);
    
    
    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    // Get an estimate of the amount this contracts claimer can get
    function claimAmount() override external onlyTrustedNode(msg.sender) {
        // Amount this claimer is entitled too
        uint256 claimerAmount = 0.1 ether;
        // Attempt to make a claim, will throw if not allowed yet
        // Init the rewards pool contract
        rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        rewardsPool.claimAmount(msg.sender, claimerAmount); 

    }

    // Trusted node claiming
    function claim() override external onlyTrustedNode(msg.sender) {
        // Amount this claimer is entitled too
        //uint256 claimerAmount = 0;
        // Attempt to make a claim, will throw if not allowed yet
        // Init the rewards pool contract
        rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        rewardsPool.claim(msg.sender, 0);

    }
    

}
