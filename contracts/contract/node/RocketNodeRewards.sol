pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

// Handles claims of node rewards
// Node rewards are taken from user fees and claimed by node operators periodically
// A portion of rewards are divided between node operators proportional to their number of active minipools
// Remaining rewards are divided between node operators proportional to their RPL security deposit staked

contract RocketNodeRewards {

    // Claim rewards for a node and transfer them to its owner address
    // Only accepts calls from registered nodes
    function claimRewards() public {}

    // Check the current reward period and increment if due
    function updateRewardPeriod() public {}

}
