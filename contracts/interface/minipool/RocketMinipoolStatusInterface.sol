pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolStatusInterface {
    function submitMinipoolWithdrawable(address _minipoolAddress, uint256 _stakingStartBalance, uint256 _stakingEndBalance) external;
    function getMinipoolNodeRewardAmount(uint256 _nodeFee, uint256 _userDeposit, uint256 _startBalance, uint256 _endBalance) external pure returns (uint256);
    function executeMinipoolWithdrawable(address _minipoolAddress, uint256 _stakingStartBalance, uint256 _stakingEndBalance) external;
}
