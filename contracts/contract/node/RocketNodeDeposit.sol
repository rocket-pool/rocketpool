pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/node/RocketNodeDepositInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";

// Handles node deposits and minipool creation

contract RocketNodeDeposit is RocketBase, RocketNodeDepositInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Accept a node deposit and create a new minipool under the node
    // Only accepts calls from registered nodes
    function deposit() external payable onlyRegisteredNode(msg.sender) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Check node settings
        require(rocketNodeSettings.getDepositEnabled(), "Node deposits are currently disabled");
        // Check deposit amount; only trusted nodes can create empty minipools
        require(
            msg.value == rocketMinipoolSettings.getActivePoolNodeDeposit() ||
            msg.value == rocketMinipoolSettings.getIdlePoolNodeDeposit() ||
            (msg.value == rocketMinipoolSettings.getEmptyPoolNodeDeposit() && getBool(keccak256(abi.encodePacked("node.trusted", msg.sender)))),
            "Invalid deposit amount"
        );
        // Create minipool
        address minipoolAddress = rocketMinipoolManager.createMinipool(msg.sender, msg.value);
        RocketMinipoolInterface minipool = RocketMinipoolInterface(minipoolAddress);
        // Transfer deposit to minipool
        minipool.nodeDeposit{value: msg.value}();
    }

}
