pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

// An individual node in the Rocket Pool network

contract RocketNode {

    // Make a deposit to create a new minipool
    function deposit() public payable {}

    // Withdraw all staked RPL to the node owner address
    // Only accepts calls from the node owner address
    function withdrawRPL() public {
        // 1. Check that the node has no active minipools
        // 2. Slash RPL proportional to any losses incurred by minipools
        // 3. Withdraw remaining RPL to the node owner address
    }

}
