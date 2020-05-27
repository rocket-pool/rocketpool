pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";

// Minipool creation, removal and management

contract RocketMinipoolManager is RocketBase {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the number of available minipools in the network
    function getAvailableMinipoolCount() public view returns (uint256) {}

    // Get a random available minipool in the network
    function getRandomAvailableMinipool() public view returns (address) {}

    // Create a minipool
    // Only accepts calls from registered nodes
    function createMinipool() public {}

    // Destroy a minipool
    // Only accepts calls from the RocketMinipoolStatus contract
    function destroyMinipool() public {}

}
