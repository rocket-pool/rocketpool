pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkSettingsInterface {
    function getMinimumNodeFee() external view returns (uint256);
    function getTargetNodeFee() external view returns (uint256);
    function getMaximumNodeFee() external view returns (uint256);
    function getNodeFeeDemandRange() external view returns (uint256);
    function getTargetRethCollateralRate() external view returns (uint256);
}
