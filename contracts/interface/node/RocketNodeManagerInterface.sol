pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeManagerInterface {
    function getNodeCount() external view returns (uint256);
    function getNodeAt(uint256 _index) external view returns (address);
    function getNodeByWithdrawalAddress(address _withdrawalAddress) external view returns (address);
    function getNodeByPendingWithdrawalAddress(address _pendingWithdrawalAddress) external view returns (address);
    function getNodeExists(address _nodeAddress) external view returns (bool);
    function getNodeWithdrawalAddress(address _nodeAddress) external view returns (address);
    function getNodePendingWithdrawalAddress(address _nodeAddress) external view returns (address);
    function getNodeTimezoneLocation(address _nodeAddress) external view returns (string memory);
    function registerNode(string calldata _timezoneLocation) external;
    function setWithdrawalAddress(address _newWithdrawalAddress, bool _confirm) external;
    function confirmWithdrawalAddress() external;
    function setTimezoneLocation(string calldata _timezoneLocation) external;
}
