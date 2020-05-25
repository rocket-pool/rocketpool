pragma solidity 0.6.8;

// An individual node in the Rocket Pool network

contract RocketNode {

    // Make a deposit to create a new minipool
    function deposit() public payable {}

    // Claim rewards for the last reward period
    // Only accepts calls from the node owner address
    function claimRewards() public {
        // 1. Check that the node has at least one active minipool
        // 2. Claim rewards
    }

    // Withdraw all staked RPL to the node owner address
    // Only accepts calls from the node owner address
    function withdrawRPL() public {
        // 1. Check that the node has no active minipools
        // 2. Slash RPL proportional to any losses incurred by minipools
        // 3. Withdraw remaining RPL to the node owner address
    }

    // Perform a node checkin
    // Only accepts calls from the node owner address
    function checkin() public {}

}