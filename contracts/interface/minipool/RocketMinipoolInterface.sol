pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolInterface {
    function nodeDeposit() external payable;
    function userDeposit() external payable;
    function exit() external;
    function withdraw(uint256 _withdrawalBalance) external;
}
