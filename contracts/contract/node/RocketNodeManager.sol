pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";

// Node registration and management

contract RocketNodeManager is RocketBase {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the number of available nodes in the network
    function getAvailableNodeCount() public returns (uint256) {}

    // Get a random available node in the network
    function getRandomAvailableNode() public returns (address) {}

    // Register a new node with Rocket Pool
    function registerNode(string memory _timezoneLocation) public {}

    // Perform a node checkin
    // Only accepts calls from registered nodes
    function checkin() public {
        // 1. Disable inactive nodes
        // 2. Update the node reward period
    }

}
