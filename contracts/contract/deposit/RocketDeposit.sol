pragma solidity 0.6.8;

// The main entry point for staker deposits
// Accepts staker deposits and mints RPX; fees are deducted and the remainder is sent to the staker
// Handles assignment of deposited ETH to minipools

contract RocketDeposit {

    // Accept a deposit from a staker
    // The staker specifies the maximum fee they are willing to pay as a fraction of 1 eth
    function deposit(uint256 _maxFee) payable {
        // 1. Check the current network fees do not exceed the max fee specified
        // 2. Mint RPX equivalent to the deposit amount
        // 3. Transfer ETH & fees to the deposit vault
        // 4. Transfer remaining RPX to the staker
        // 5. Assign deposits
    }

    // Assign deposits to available minipools
    function assignDeposits() {
        // 1. Check there is an available minipool and >= 16 ETH in deposits
        // 2. Select a pseudo-random minipool from the available set
        // 3. Transfer 16 ETH and a proportional share of the node fee pool from the deposit vault to the minipool
    }

}
