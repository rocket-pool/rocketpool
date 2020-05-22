pragma solidity 0.6.8;

// Handles claims of RPL staking rewards
// Staking rewards are taken from user fees and claimed by node operators periodically
// Node operators are entitled to rewards proportional to their total RPL security deposit staked

contract RocketNodeRewards {

    // Claim staking rewards for a node and transfer them to its owner address
    // Only accepts calls from registered nodes
    function claimRewards() public {}

    // Check the current reward period and increment if due
    function updateRewardPeriod() public {}

}
