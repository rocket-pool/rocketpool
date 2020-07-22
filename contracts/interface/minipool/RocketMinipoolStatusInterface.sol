pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolStatusInterface {
    function submitMinipoolWithdrawable(address _minipoolAddress, uint256 _withdrawalBalance, uint256 _startEpoch, uint256 _endEpoch, uint256 _userStartEpoch) external;
}
