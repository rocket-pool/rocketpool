// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

interface RocketNetworkRevenuesInterface {
    function initialise(uint256 _initialNodeShare, uint256 _initialVoterShare) external;
    function getCurrentNodeShare() external view returns (uint256);
    function getCurrentVoterShare() external view returns (uint256);
    function setNodeShare(uint256 _newShare) external;
    function setVoterShare(uint256 _newShare) external;
    function calculateSplit(uint256 _sinceBlock) external view returns (uint256, uint256, uint256);
}
