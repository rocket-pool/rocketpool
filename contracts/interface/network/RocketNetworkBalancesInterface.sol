pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;
// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkBalancesInterface {
    function getBalancesTimestamp() external view returns (uint256);
    function getBalancesBlock() external view returns (uint256);
    function getTotalETHBalance() external view returns (uint256);
    function getStakingETHBalance() external view returns (uint256);
    function getTotalRETHSupply() external view returns (uint256);
    function getETHUtilizationRate() external view returns (uint256);
    function submitBalances(uint256 _block, uint256 _slotTimestamp, uint256 _total, uint256 _staking, uint256 _rethSupply) external;
    function executeUpdateBalances(uint256 _block, uint256 _slotTimestamp, uint256 _totalEth, uint256 _stakingEth, uint256 _rethSupply) external;
}
