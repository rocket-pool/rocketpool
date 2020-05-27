pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeRewardsInterface {
    function getBalance() external view returns (uint256);
    function setBalance(uint256 _value) external;
    function updateRewardPeriod() external;
}
