pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolFactoryInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";

// Minipool creation, removal and management

contract RocketMinipoolManager is RocketBase, RocketMinipoolManagerInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the number of available minipools in the network
    function getAvailableMinipoolCount() public view returns (uint256) {}

    // Get a random available minipool in the network
    function getRandomAvailableMinipool() public view returns (address) {}

    // Create a minipool
    // Only accepts calls from the RocketNodeDeposit contract
    function createMinipool(address _nodeAddress) external onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Load contracts
        RocketMinipoolFactoryInterface rocketMinipoolFactory = RocketMinipoolFactoryInterface(getContractAddress("rocketMinipoolFactory"));
        // Create minipool contract
        address contractAddress = rocketMinipoolFactory.createMinipool(_nodeAddress);
    }

    // Destroy a minipool
    // Only accepts calls from the RocketMinipoolStatus contract
    function destroyMinipool() external onlyLatestContract("rocketMinipoolStatus", msg.sender) {}

}
