pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkSettingsInterface {
    function getTargetRethCollateralRate() external view returns (uint256);
}
