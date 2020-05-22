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
        // 3. Transfer fees to the deposit vault
        // 4. Transfer remaining RPX to the staker
    }

}
