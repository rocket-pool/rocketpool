pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";

// Handles node checkins
// Nodes report their status and perform a variety of tasks on checkin
// Tasks are organized into task contracts and run sequentially

contract RocketNodeCheckin is RocketBase {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Perform a node checkin
    // Only accepts calls from registered nodes
    function checkin() public {
        // 1. Disable inactive nodes
        // 2. Update the node reward period
    }

}
