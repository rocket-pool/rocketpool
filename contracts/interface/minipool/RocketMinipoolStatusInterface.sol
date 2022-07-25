pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolStatusInterface {
    function submitMinipoolWithdrawable(address _minipoolAddress) external;
    function executeMinipoolWithdrawable(address _minipoolAddress) external;
}
