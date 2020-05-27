pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeRewardsInterface {
    function getBalance() external view returns (uint256);
    function increaseBalance(uint256 _amount) external;
    function updateRewardPeriod() external;
}
