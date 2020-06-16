pragma solidity 0.6.9;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDepositSettingsInterface {
    function getDepositEnabled() external view returns (bool);
    function getAssignDepositsEnabled() external view returns (bool);
    function getMinimumDeposit() external view returns (uint256);
    function getMaximumDepositAssignments() external view returns (uint256);
}
