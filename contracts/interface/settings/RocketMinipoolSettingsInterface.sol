pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolSettingsInterface {
    function getLaunchBalance() external view returns (uint256);
    function getActivePoolNodeDeposit() external view returns (uint256);
    function getIdlePoolNodeDeposit() external view returns (uint256);
    function getEmptyPoolNodeDeposit() external view returns (uint256);
    function getActivePooUserDeposit() external view returns (uint256);
    function getIdlePooUserDeposit() external view returns (uint256);
    function getEmptyPooUserDeposit() external view returns (uint256);
}
