pragma solidity 0.6.9;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDepositPoolInterface {
    function getBalance() external view returns (uint256);
    function deposit() external payable;
    function recycleDissolvedDeposit() external payable;
    function recycleWithdrawnDeposit() external payable;
    function assignDeposits() external;
}
