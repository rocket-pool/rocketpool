pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/node/RocketNodeDepositInterface.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../types/MinipoolDeposit.sol";

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
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Check node settings
        require(rocketNodeSettings.getDepositEnabled(), "Node deposits are currently disabled");
        // Get deposit type by node deposit amount
        MinipoolDeposit depositType = MinipoolDeposit.None;
        if (msg.value == rocketMinipoolSettings.getFullDepositNodeAmount()) { depositType = MinipoolDeposit.Full; }
        else if (msg.value == rocketMinipoolSettings.getHalfDepositNodeAmount()) { depositType = MinipoolDeposit.Half; }
        else if (msg.value == rocketMinipoolSettings.getEmptyDepositNodeAmount()) { depositType = MinipoolDeposit.Empty; }
        // Check deposit type; only trusted nodes can create empty minipools
        require(depositType != MinipoolDeposit.None, "Invalid node deposit amount");
        require(depositType != MinipoolDeposit.Empty || getBool(keccak256(abi.encodePacked("node.trusted", msg.sender))), "Invalid node deposit amount");
        // Create minipool
        address minipoolAddress = rocketMinipoolManager.createMinipool(msg.sender, depositType);
        RocketMinipoolInterface minipool = RocketMinipoolInterface(minipoolAddress);
        // Transfer deposit to minipool
        minipool.nodeDeposit{value: msg.value}();
        // Assign deposits if enabled
        if (rocketDepositSettings.getAssignDepositsEnabled()) { rocketDepositPool.assignDeposits(); }
    }

}
