// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

import "../../types/NodeDetails.sol";

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
    function getNodeRPLWithdrawalAddress(address _nodeAddress) external view returns (address);
    function getNodeRPLWithdrawalAddressIsSet(address _nodeAddress) external view returns (bool);
    function unsetRPLWithdrawalAddress(address _nodeAddress) external;
    function setRPLWithdrawalAddress(address _nodeAddress, address _newRPLWithdrawalAddress, bool _confirm) external;
    function confirmRPLWithdrawalAddress(address _nodeAddress) external;
    function getNodePendingRPLWithdrawalAddress(address _nodeAddress) external view returns (address);
    function getNodeTimezoneLocation(address _nodeAddress) external view returns (string memory);
    function registerNode(string calldata _timezoneLocation) external;
    function getNodeRegistrationTime(address _nodeAddress) external view returns (uint256);
    function setTimezoneLocation(string calldata _timezoneLocation) external;
    function setRewardNetwork(address _nodeAddress, uint256 network) external;
    function getRewardNetwork(address _nodeAddress) external view returns (uint256);
    function getFeeDistributorInitialised(address _nodeAddress) external view returns (bool);
    function initialiseFeeDistributor() external;
    function getAverageNodeFee(address _nodeAddress) external view returns (uint256);
    function setSmoothingPoolRegistrationState(bool _state) external;
    function getSmoothingPoolRegistrationState(address _nodeAddress) external returns (bool);
    function getSmoothingPoolRegistrationChanged(address _nodeAddress) external returns (uint256);
    function getSmoothingPoolRegisteredNodeCount(uint256 _offset, uint256 _limit) external view returns (uint256);
    function getNodeAddresses(uint256 _offset, uint256 _limit) external view returns (address[] memory);
    function deployMegapool() external returns (address);
    function getExpressTicketCount(address _nodeAddress) external view returns (uint256);
    function useExpressTicket(address _nodeAddress) external;
    function provisionExpressTickets(address _nodeAddress) external;
    function refundExpressTicket(address _nodeAddress) external;
    function getMegapoolAddress(address _nodeAddress) external view returns (address);
    function getUnclaimedRewards(address _nodeAddress) external view returns (uint256);
    function addUnclaimedRewards(address _nodeAddress) external payable;
    function claimUnclaimedRewards(address _nodeAddress) external;
}
