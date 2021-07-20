pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolStatusInterface {
    function submitMinipoolWithdrawable(address _minipoolAddress) external;
    function executeMinipoolWithdrawable(address _minipoolAddress) external;
}
