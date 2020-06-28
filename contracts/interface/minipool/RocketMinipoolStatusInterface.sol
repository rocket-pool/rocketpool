pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolStatusInterface {
    function submitMinipoolExited(address _minipoolAddress, uint256 _epoch) external;
    function submitMinipoolWithdrawable(address _minipoolAddress, uint256 _withdrawalBalance, uint256 _epoch) external;
}
