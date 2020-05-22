pragma solidity 0.6.8;

// An individual node in the Rocket Pool network

contract RocketNode {

    // Make a deposit to create a new minipool
    function deposit() public payable {}

    // Claim RPL staking rewards for the last reward period
    // Only accepts calls from the node owner address
    function claimStakingRewards() public {}

    // Withdraw all staked RPL to the node owner address
    // Only accepts calls from the node owner address
    function withdrawRPL() public {}

    // Perform a node checkin
    // Only accepts calls from the node owner address
    function checkin() public {}

}
