pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOSettingsInterface {
    function getInflationIntervalRate() external view returns (uint256);
    function getInflationIntervalBlocks() external view returns (uint256);
}
