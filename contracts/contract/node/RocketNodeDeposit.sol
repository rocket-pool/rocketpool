pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/network/RocketNetworkFeesInterface.sol";
import "../../interface/node/RocketNodeDepositInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../types/MinipoolDeposit.sol";

// Handles node deposits and minipool creation

contract RocketNodeDeposit is RocketBase, RocketNodeDepositInterface {

    // Events
    event DepositReceived(address indexed from, uint256 amount, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Accept a node deposit and create a new minipool under the node
    // Only accepts calls from registered nodes
    function deposit(uint256 _minimumNodeFee) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        // Load contracts
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNetworkFeesInterface rocketNetworkFees = RocketNetworkFeesInterface(getContractAddress("rocketNetworkFees"));
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Check node settings
        require(rocketNodeSettings.getDepositEnabled(), "Node deposits are currently disabled");
        // Check current node fee
        require(rocketNetworkFees.getNodeFee() >= _minimumNodeFee, "Minimum node fee exceeds current network node fee");
        // Get deposit type by node deposit amount
        MinipoolDeposit depositType = MinipoolDeposit.None;
        if (msg.value == rocketMinipoolSettings.getFullDepositNodeAmount()) { depositType = MinipoolDeposit.Full; }
        else if (msg.value == rocketMinipoolSettings.getHalfDepositNodeAmount()) { depositType = MinipoolDeposit.Half; }
        else if (msg.value == rocketMinipoolSettings.getEmptyDepositNodeAmount()) { depositType = MinipoolDeposit.Empty; }
        // Check deposit type; only trusted nodes can create empty minipools
        require(depositType != MinipoolDeposit.None, "Invalid node deposit amount");
        require(depositType != MinipoolDeposit.Empty || rocketNodeManager.getNodeTrusted(msg.sender), "Invalid node deposit amount");
        // Emit deposit received event
        emit DepositReceived(msg.sender, msg.value, now);
        // Create minipool
        address minipoolAddress = rocketMinipoolManager.createMinipool(msg.sender, depositType);
        RocketMinipoolInterface minipool = RocketMinipoolInterface(minipoolAddress);
        // Transfer deposit to minipool
        minipool.nodeDeposit{value: msg.value}();
        // Assign deposits if enabled
        if (rocketDepositSettings.getAssignDepositsEnabled()) { rocketDepositPool.assignDeposits(); }
    }

}
