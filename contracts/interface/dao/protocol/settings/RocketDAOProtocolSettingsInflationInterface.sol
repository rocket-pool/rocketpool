pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProtocolSettingsInflationInterface {
    function getInflationIntervalRate() external view returns (uint256);
    function getInflationIntervalStartTime() external view returns (uint256);
}
