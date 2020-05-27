pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";

// Handles claims of node rewards
// Node rewards are taken from user fees and claimed by node operators periodically
// A portion of rewards are divided between node operators proportional to their number of active minipools
// Remaining rewards are divided between node operators proportional to their RPL security deposit staked

contract RocketNodeRewards is RocketBase {

	// Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Current reward pool balance
    // Can only be set internally or by the RocketDepositPool contract
    function getBalance() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("reward.pool.balance")));
    }
    function setBalance(uint256 _value) public {
        rocketStorage.setUint(keccak256(abi.encodePacked("reward.pool.balance")), _value);
    }

    // Claim rewards for a node and transfer them to its owner address
    // Only accepts calls from registered nodes
    function claimRewards() public {}

    // Check the current reward period and increment if due
    function updateRewardPeriod() public {}

}
