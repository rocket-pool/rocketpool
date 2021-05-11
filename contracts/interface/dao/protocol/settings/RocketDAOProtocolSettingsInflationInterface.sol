pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProtocolSettingsInflationInterface {
    function getInflationIntervalRate() external view returns (uint256);
    function getInflationIntervalTime() external view returns (uint256);
    function getInflationIntervalStartTime() external view returns (uint256);
}
