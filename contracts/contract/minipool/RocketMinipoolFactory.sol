pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketMinipool.sol";
import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolFactoryInterface.sol";

// Minipool contract factory

contract RocketMinipoolFactory is RocketBase, RocketMinipoolFactoryInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Create a new RocketMinipool contract
    function createMinipool(address _nodeAddress) override external onlyLatestContract("rocketMinipoolManager", msg.sender) returns (address) {
        // Create RocketMinipool contract
        address contractAddress = address(new RocketMinipool(address(rocketStorage), _nodeAddress));
        // Return
        return contractAddress;
    }

}
