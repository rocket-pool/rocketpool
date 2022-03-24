pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProtocolSettingsNetworkInterface {
    function getNodeConsensusThreshold() external view returns (uint256);
    function getSubmitBalancesEnabled() external view returns (bool);
    function getSubmitBalancesFrequency() external view returns (uint256);
    function getSubmitPricesEnabled() external view returns (bool);
    function getSubmitPricesFrequency() external view returns (uint256);
    function getMinimumNodeFee() external view returns (uint256);
    function getTargetNodeFee() external view returns (uint256);
    function getMaximumNodeFee() external view returns (uint256);
    function getNodeFeeDemandRange() external view returns (uint256);
    function getTargetGgpavaxCollateralRate() external view returns (uint256);
    function getGgpavaxDepositDelay() external view returns (uint256);
}
