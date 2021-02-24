pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/network/RocketNetworkFeesInterface.sol";
import "../../interface/node/RocketNodeDepositInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMembersInterface.sol";
import "../../types/MinipoolDeposit.sol";

// Handles node deposits and minipool creation

contract RocketNodeDeposit is RocketBase, RocketNodeDepositInterface {

    // Events
    event DepositReceived(address indexed from, uint256 amount, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Accept a node deposit and create a new minipool under the node
    // Only accepts calls from registered nodes
    function deposit(uint256 _minimumNodeFee) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        // Load contracts
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketNetworkFeesInterface rocketNetworkFees = RocketNetworkFeesInterface(getContractAddress("rocketNetworkFees"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        RocketDAONodeTrustedInterface rocketDaoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketDAONodeTrustedSettingsMembersInterface rocketDaoNodeTrustedSettingsMembers = RocketDAONodeTrustedSettingsMembersInterface(getContractAddress("rocketDAONodeTrustedSettingsMembers"));
        // Check node settings
        require(rocketDAOProtocolSettingsNode.getDepositEnabled(), "Node deposits are currently disabled");
        // Check current node fee
        require(rocketNetworkFees.getNodeFee() >= _minimumNodeFee, "Minimum node fee exceeds current network node fee");
        // Get deposit type by node deposit amount
        MinipoolDeposit depositType = MinipoolDeposit.None;
        if (msg.value == rocketDAOProtocolSettingsMinipool.getFullDepositNodeAmount()) { depositType = MinipoolDeposit.Full; }
        else if (msg.value == rocketDAOProtocolSettingsMinipool.getHalfDepositNodeAmount()) { depositType = MinipoolDeposit.Half; }
        else if (msg.value == rocketDAOProtocolSettingsMinipool.getEmptyDepositNodeAmount()) { depositType = MinipoolDeposit.Empty; }
        // Check deposit type is valid
        require(depositType != MinipoolDeposit.None, "Invalid node deposit amount");
        // Node is trusted
        if (rocketDaoNodeTrusted.getMemberIsValid(msg.sender)) {
            // If creating an unbonded minipool, check current unbonded minipool count
            if (depositType == MinipoolDeposit.Empty) {
                require(rocketDaoNodeTrusted.getMemberUnbondedValidatorCount(msg.sender) < rocketDaoNodeTrustedSettingsMembers.getMinipoolUnbondedMax(), "Trusted node member would exceed the amount of unbonded minipools allowed");
            }
        }
        // Node is not trusted - it cannot create unbonded minipools
        else { require(depositType != MinipoolDeposit.Empty, "Only members of the trusted node DAO may create unbonded minipools"); }
        // Emit deposit received event
        emit DepositReceived(msg.sender, msg.value, block.timestamp);
        // Create minipool
        address minipoolAddress = rocketMinipoolManager.createMinipool(msg.sender, depositType);
        RocketMinipoolInterface minipool = RocketMinipoolInterface(minipoolAddress);
        // Transfer deposit to minipool
        minipool.nodeDeposit{value: msg.value}();
        // Assign deposits if enabled
        if (rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) { rocketDepositPool.assignDeposits(); }
    }

}
