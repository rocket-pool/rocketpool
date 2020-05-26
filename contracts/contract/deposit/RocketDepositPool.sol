pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

// The main entry point for deposits into the RP network
// Accepts user deposits and mints rETH; fees are deducted and the remainder is sent to the user
// Handles assignment of deposited ETH to minipools

contract RocketDepositPool {

    // Accept a deposit from a user
    // The user specifies the maximum fee % they are willing to pay as a fraction of 1 ETH
    function deposit(uint256 _maxFee) public payable {
        // 1. Check the current network fee does not exceed the max fee specified
        // 2. Mint rETH equivalent to the deposit amount
        // 3. Update the RP network total ETH balance
        // 4. Transfer ETH & fee to the vault
        // 5. Transfer remaining rETH to the user
        // 6. Assign deposits
    }

    // Recycle a deposit from a withdrawn minipool
    // Only accepts calls from the RocketPool contract
    function recycleDeposit() public payable {
        // 1. Transfer ETH to the vault
        // 2. Assign deposits
    }

    // Assign deposits to available minipools
    function assignDeposits() public {
        // Repeat N times:
        // 1. Check there is an available minipool and >= 16 ETH in deposits
        // 2. Select a pseudo-random minipool from the available set
        // 3. Transfer 16 ETH from the deposit vault to the minipool
    }

}
