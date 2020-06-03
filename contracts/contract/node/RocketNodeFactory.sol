pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketNode.sol";
import "../RocketBase.sol";
import "../../interface/node/RocketNodeFactoryInterface.sol";

// Node contract factory

contract RocketNodeFactory is RocketBase, RocketNodeFactoryInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Create a new RocketNode contract
    function createNode(address _nodeAddress) override external onlyLatestContract("rocketNodeManager", msg.sender) returns (address) {
        // Create RocketNode contract
        address contractAddress = address(new RocketNode(address(rocketStorage), _nodeAddress));
        // Return
        return contractAddress;
    }

}
