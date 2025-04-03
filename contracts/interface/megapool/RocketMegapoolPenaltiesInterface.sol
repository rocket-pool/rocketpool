// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketMegapoolPenaltiesInterface {
    function getVoteCount(address _megapool, uint256 _block, uint256 _amount) external view returns (uint256);
    function penalise(address _megapool, uint256 _block, uint256 _amount) external;
    function getPenaltyRunningTotalAtBlock(address _megapool, uint32 _block) external view returns (uint256);
    function getCurrentPenaltyRunningTotal(address _megapool) external view returns (uint256);
    function getCurrentMaxPenalty(address _megapool) external view returns (uint256);
}
