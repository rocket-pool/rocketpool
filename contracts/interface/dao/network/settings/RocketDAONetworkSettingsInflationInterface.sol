pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONetworkSettingsInflationInterface {
    function getInflationIntervalRate() external view returns (uint256);
    function getInflationIntervalBlocks() external view returns (uint256);
    function getInflationIntervalStartBlock() external view returns (uint256);
}
