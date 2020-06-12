pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/network/RocketNetworkWithdrawalInterface.sol";
import "../../interface/token/RocketETHTokenInterface.sol";
import "../../interface/token/RocketNodeETHTokenInterface.sol";
import "../../lib/SafeMath.sol";

// Handles network validator withdrawals

contract RocketNetworkWithdrawal is RocketBase, RocketNetworkWithdrawalInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the validator withdrawal credentials
    function getWithdrawalCredentials() override public view returns (bytes memory) {
        // TODO: implement
        return hex"0000000000000000000000000000000000000000000000000000000000000000";
    }

    // Process a validator withdrawal from the beacon chain
    // Only accepts calls from trusted (withdrawer) nodes (TBA)
    function withdraw(bytes calldata _validatorPubkey) external payable onlyTrustedNode(msg.sender) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketETHTokenInterface rocketETHToken = RocketETHTokenInterface(getContractAddress("rocketETHToken"));
        RocketNodeETHTokenInterface rocketNodeETHToken = RocketNodeETHTokenInterface(getContractAddress("rocketNodeETHToken"));
        // Check validator minipool
        address minipool = rocketMinipoolManager.getMinipoolByPubkey(_validatorPubkey);
        require(minipool != address(0x0), "Invalid minipool validator");
        // Check withdrawal amount
        require(msg.value == rocketMinipoolManager.getMinipoolTotalWithdrawalBalance(minipool), "Invalid withdrawal amount");
        // Get node & user amounts
        uint256 nodeAmount = rocketMinipoolManager.getMinipoolNodeWithdrawalBalance(minipool);
        uint256 userAmount = msg.value.sub(nodeAmount);
        // Transfer node balance to nETH contract
        if (nodeAmount > 0) { rocketNodeETHToken.deposit{value: nodeAmount}(); }
        // Transfer user balance to rETH contract
        // TODO: transfer to the deposit pool instead if rETH collateral ratio is >= minimum
        if (userAmount > 0) { rocketETHToken.deposit{value: userAmount}(); }
    }

}
