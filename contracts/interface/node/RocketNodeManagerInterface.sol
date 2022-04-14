pragma solidity 0.7.6;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeManagerInterface {

    // Structs
    struct TimezoneCount {
        string timezone;
        uint256 count;
    }

    function getNodeCount() external view returns (uint256);
    function getNodeCountPerTimezone(uint256 offset, uint256 limit) external view returns (TimezoneCount[] memory);
    function getNodeAt(uint256 _index) external view returns (address);
    function getNodeExists(address _nodeAddress) external view returns (bool);
    function getNodeWithdrawalAddress(address _nodeAddress) external view returns (address);
    function getNodePendingWithdrawalAddress(address _nodeAddress) external view returns (address);
    function getNodeTimezoneLocation(address _nodeAddress) external view returns (string memory);
    function registerNode(string calldata _timezoneLocation) external;
    function getNodeRegistrationTime(address _nodeAddress) external view returns (uint256) {
    function setTimezoneLocation(string calldata _timezoneLocation) external;
    function setRewardNetwork(address _nodeAddress, uint256 network) external;
    function getRewardNetwork(address _nodeAddress) external view returns (uint256);
    function getFeeDistributorInitialised(address _nodeAddress) external returns (bool);
    function initialiseFeeDistributor() external;
    function increaseAverageNodeFeeNumerator(address _nodeAddress, uint256 _amount) external;
    function decreaseAverageNodeFeeNumerator(address _nodeAddress, uint256 _amount) external;
    function getAverageNodeFee(address _nodeAddress) external view returns (uint256);
}
