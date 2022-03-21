pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/RocketVaultInterface.sol";
import "../../../interface/rewards/RocketRewardsPoolInterface.sol";
import "../../../interface/rewards/claims/RocketClaimDAOInterface.sol";


// GGP Rewards claiming by the DAO
contract RocketClaimDAO is RocketBase, RocketClaimDAOInterface {

    // Events
    event GGPTokensSentByDAOProtocol(string invoiceID, address indexed from, address indexed to, uint256 amount, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }

    // Determine if this contract is enabled or not for claims
    function getEnabled() override external view returns (bool) {
        // Init the rewards pool contract
        RocketRewardsPoolInterface rewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
        return rewardsPool.getClaimingContractEnabled("rocketClaimDAO");
    }


    // Spend the network DAOs GGP rewards
    function spend(string memory _invoiceID, address _recipientAddress, uint256 _amount) override external onlyLatestContract("rocketDAOProtocolProposals", msg.sender) {
        // Load contracts
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Addresses
        IERC20 ggpToken = IERC20(getContractAddress("gogoTokenGGP"));
        // Some initial checks
        require(_amount > 0 && _amount <= rocketVault.balanceOfToken("rocketClaimDAO", ggpToken), "You cannot send 0 GGP or more than the DAO has in its account");
        // Send now
        rocketVault.withdrawToken(_recipientAddress, ggpToken, _amount);
        // Log it
        emit GGPTokensSentByDAOProtocol(_invoiceID, address(this), _recipientAddress, _amount, block.timestamp);
    }
  

}
