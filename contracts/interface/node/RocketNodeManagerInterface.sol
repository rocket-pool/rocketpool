pragma solidity 0.6.9;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeManagerInterface {
    function getNodeCount() external view returns (uint256);
    function getNodeAt(uint256 _index) external view returns (address);
    function getNodeExists(address _nodeAddress) external view returns (bool);
    function getNodeTrusted(address _nodeAddress) external view returns (bool);
    function getNodeTimezoneLocation(address _nodeAddress) external view returns (string memory);
}
