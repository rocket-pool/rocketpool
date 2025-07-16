pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkPenaltiesInterface {
    function getVoteCount(address _minipool, uint256 _block) external view returns (uint256);
    function submitPenalty(address _minipool, uint256 _block) external;
    function executeUpdatePenalty(address _minipool, uint256 _block) external;
    function getPenaltyRunningTotalAtBlock(uint32 _block) external view returns (uint256);
    function getCurrentPenaltyRunningTotal() external view returns (uint256);
    function getCurrentMaxPenalty() external view returns (uint256);
    function getPenaltyCount(address _minipoolAddress) external view returns (uint256);
}
