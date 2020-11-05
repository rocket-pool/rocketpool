pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/rewards/RocketRewardsPoolInterface.sol";
import "../../../interface/rewards/claims/RocketRewardsClaimNodeInterface.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


// RPL Rewards claiming for nodes (trusted) and minipool validators
contract RocketClaimTrustedNode is RocketBase, RocketRewardsClaimNodeInterface {

    // Contracts
    RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(0);

    // Events
    // event RPLTokensDeposited(uint256 amount, uint256 time);
    
    
    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    // Trusted node claiming
    function claimNode() override external onlyTrustedNode(msg.sender) {
        // Get the percentage to claim for this claimer
        //uint256 claimPerc =
        // Attempt to make a claim, will throw if not allowed yet
        claimRewards();

    }
    
    // Withdraw rewards from the pool
    function claimRewards() private {
        // Init the rewards pool contract
        rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        rewardsPool.claim();
         /*
         // Valid amount?
        require(_amount > 0, "No valid amount of tokens given to deposit");
        // Get Rocket Vault
        address rocketVaultAddress = getContractAddress("rocketVault");
        // Get the token ERC20 instance
        IERC20 tokenContract = IERC20(msg.sender);
        // Send the tokens to this contract now and mint new ones for them
        if (tokenContract.approve(rocketVaultAddress, _amount)) {
            // Init Rocket Vault
            RocketVaultInterface rocketVault = RocketVaultInterface(rocketVaultAddress);
            // Now start the deposit
            rocketVault.depositToken(msg.sender, _amount);
            // Emit token transfer
            emit RPLTokensDeposited(_amount, now);
        }else{
            revert("Token transfer was not successful");
        }
        */
    }

}
