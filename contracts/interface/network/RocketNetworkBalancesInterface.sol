pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkBalancesInterface {
    function getTotalETHBalance() external view returns (uint256);
    function getStakingETHBalance() external view returns (uint256);
    function getETHBalancesEpoch() external view returns (uint256);
    function getETHUtilizationRate() external view returns (uint256);
    function increaseTotalETHBalance(uint256 _amount) external;
    function decreaseTotalETHBalance(uint256 _amount) external;
    function submitETHBalances(uint256 _epoch, uint256 _total, uint256 _staking) external;
}
