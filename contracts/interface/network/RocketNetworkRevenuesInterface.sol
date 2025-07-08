// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

interface RocketNetworkRevenuesInterface {
    function initialise(uint256 _initialNodeShare, uint256 _initialVoterShare, uint256 _initialProtocolDAOShare) external;
    function getCurrentNodeShare() external view returns (uint256);
    function getCurrentVoterShare() external view returns (uint256);
    function getCurrentProtocolDAOShare() external view returns (uint256);
    function setNodeShare(uint256 _newShare) external;
    function setVoterShare(uint256 _newShare) external;
    function setProtocolDAOShare(uint256 _newShare) external;
    function calculateSplit(uint256 _sinceBlock) external view returns (uint256 nodeShare, uint256 voterShare, uint256 protocolDAOShare, uint256 rethShare);
}
