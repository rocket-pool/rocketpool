// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketNetworkVotingInterface {
    function getNodeCount(uint32 _block) external view returns (uint256);
    function getVotingPower(address _nodeAddress, uint32 _block) external view returns (uint256);
    function setDelegate(address _newDelegate) external;
    function getDelegate(address _nodeAddress, uint32 _block) external view returns (address);
    function getCurrentDelegate(address _nodeAddress) external view returns (address);
}