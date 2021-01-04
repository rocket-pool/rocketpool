pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/RocketVaultInterface.sol";
import "../../../interface/settings/RocketDAOSettingsInterface.sol";
import "../../../interface/rewards/RocketRewardsPoolInterface.sol";
import "../../../interface/rewards/claims/RocketClaimDAOInterface.sol";


// RPL Rewards claiming by the DAO
contract RocketClaimDAO is RocketBase, RocketClaimDAOInterface {

    // Events
    event RPLTokensSentDAO(address indexed from, address indexed to, uint256 amount, uint256 time);  

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    // Determine if this contract is enabled or not for claims
    function getEnabled() override public view returns (bool) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress('rocketRewardsPool'));
        return rewardsPool.getClaimingContractEnabled('rocketClaimDAO');
    }

    // Get the amount of RPL on this contract 
    function getRewardsBalance() override public view returns (uint256) {
        // Load contracts
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress('rocketVault'));
        // Has the DAO rewards address been set and there's a balance to send?
        return rocketVault.balanceOfToken('rocketClaimDAO', getContractAddress('rocketTokenRPL'));
    }

    // Can we send funds to the DAO now? this is checked and executed automatically if the DAO address is set 
    function getRewardsSendPossible() override public view returns (bool) {
        // Load contracts
        RocketDAOSettingsInterface daoSettings = RocketDAOSettingsInterface(getContractAddress('rocketDAOSettings'));
        // Has the DAO rewards address been set and there's a balance to send?
        return daoSettings.getRewardsDAOAddress() != address(0x0) && getRewardsBalance() > 0 ? true : false;
    }

    // Send the rewards to the DAOs treasury address
    function send() override public onlyLatestContract("rocketClaimDAO", address(this)) {
        // Verify this trusted node is able to claim
        require(getRewardsSendPossible(), "DAO treasury address not set to receive rewards or there is no RPL balance to send");
        // Load contract s
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress('rocketVault'));
        RocketDAOSettingsInterface daoSettings = RocketDAOSettingsInterface(getContractAddress('rocketDAOSettings'));
        // Addresses
        address rplTokenAddress = getContractAddress('rocketTokenRPL');
        address daoTreasuryAddress = daoSettings.getRewardsDAOAddress();
        // Amount to send
        uint256 tokenAmount = getRewardsBalance();
        // Send now
        require(rocketVault.withdrawToken(daoSettings.getRewardsDAOAddress(), rplTokenAddress, tokenAmount), "Could not send token balance from vault for DAO");
        // Log it
        emit RPLTokensSentDAO(address(this), daoTreasuryAddress, tokenAmount, now);
    }
    

}
