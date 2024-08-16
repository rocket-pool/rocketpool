// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketNetworkVotingInterface {
    function initialiseVotingFor(address _nodeAddress) external;
    function initialiseVoting() external;
    function initialiseVotingWithDelegate(address _delegate) external;
    function getVotingInitialised(address _nodeAddress) external view returns (bool);
    function getNodeCount(uint32 _block) external view returns (uint256);
    function getVotingPower(address _nodeAddress, uint32 _block) external view returns (uint256);
    function setDelegate(address _newDelegate) external;
    function getDelegate(address _nodeAddress, uint32 _block) external view returns (address);
    function getCurrentDelegate(address _nodeAddress) external view returns (address);
}