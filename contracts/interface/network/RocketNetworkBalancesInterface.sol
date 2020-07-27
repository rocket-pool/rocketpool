pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkBalancesInterface {
    function getTotalETHBalance() external view returns (uint256);
    function getStakingETHBalance() external view returns (uint256);
    function getTotalRETHSupply() external view returns (uint256);
    function getETHBalancesBlock() external view returns (uint256);
    function getETHUtilizationRate() external view returns (uint256);
    function submitETHBalances(uint256 _block, uint256 _total, uint256 _staking, uint256 _rethSupply) external;
}
