pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDepositSettingsInterface {
    function getDepositEnabled() external view returns (bool);
    function getAssignDepositsEnabled() external view returns (bool);
    function getMinimumDeposit() external view returns (uint256);
    function getMinimumDepositFee() external view returns (uint256);
    function getMaximumDepositFee() external view returns (uint256);
    function getNodeDemandFeeRange() external view returns (uint256);
}
