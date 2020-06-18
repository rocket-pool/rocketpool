pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketBase.sol";
import "../interface/RocketVaultInterface.sol";

// ETH and rETH are stored here to prevent contract upgrades from affecting balances

contract RocketVault is RocketBase, RocketVaultInterface {

    // Events
    event EtherDeposited(address indexed from, uint256 amount, uint256 time);
    event EtherWithdrawn(address indexed from, address indexed to, uint256 amount, uint256 time);

	// Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Accept an ETH deposit
    // Only accepts calls from Rocket Pool network contracts
    function depositEther() override external payable onlyLatestNetworkContract {
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, now);
    }

    // Withdraw an amount of ETH to a specified address
    // Only accepts calls from Rocket Pool network contracts
    function withdrawEther(address _withdrawalAddress, uint256 _amount) override external onlyLatestNetworkContract {
        // Withdraw
        (bool success,) = _withdrawalAddress.call{value: _amount}("");
        require(success, "ETH amount could not be transferred to the withdrawal address");
        // Emit ether withdrawn event
        emit EtherWithdrawn(msg.sender, _withdrawalAddress, _amount, now);
    }

}
