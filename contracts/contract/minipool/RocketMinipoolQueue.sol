pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/util/AddressQueueStorageInterface.sol";
import "../../types/MinipoolDeposit.sol";

// Minipool queueing for deposit assignment

contract RocketMinipoolQueue is RocketBase, RocketMinipoolQueueInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event MinipoolEnqueued(address indexed minipool, bytes32 indexed queueId, uint256 time);
    event MinipoolDequeued(address indexed minipool, bytes32 indexed queueId, uint256 time);
    event MinipoolRemoved(address indexed minipool, bytes32 indexed queueId, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get the total combined length of the queues
    function getTotalLength() override public view returns (uint256) {
        return (
            getLength(MinipoolDeposit.Full)
        ).add(
            getLength(MinipoolDeposit.Half)
        ).add(
            getLength(MinipoolDeposit.Empty)
        );
    }

    // Get the length of a queue
    // Returns 0 for invalid queues
    function getLength(MinipoolDeposit _depositType) override public view returns (uint256) {
        if (_depositType == MinipoolDeposit.Full) { return getLength("minipools.available.full"); }
        if (_depositType == MinipoolDeposit.Half) { return getLength("minipools.available.half"); }
        if (_depositType == MinipoolDeposit.Empty) { return getLength("minipools.available.empty"); }
        return 0;
    }
    function getLength(string memory _queueId) private view returns (uint256) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        return addressQueueStorage.getLength(keccak256(abi.encodePacked(_queueId)));
    }

    // Get the total combined capacity of the queues
    function getTotalCapacity() override public view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        return (
            getLength(MinipoolDeposit.Full).mul(rocketDAOProtocolSettingsMinipool.getFullDepositUserAmount())
        ).add(
            getLength(MinipoolDeposit.Half).mul(rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount())
        ).add(
            getLength(MinipoolDeposit.Empty).mul(rocketDAOProtocolSettingsMinipool.getEmptyDepositUserAmount())
        );
    }

    // Get the total effective capacity of the queues (used in node demand calculation)
    function getEffectiveCapacity() override public view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        return (
            getLength(MinipoolDeposit.Full).mul(rocketDAOProtocolSettingsMinipool.getFullDepositUserAmount())
        ).add(
            getLength(MinipoolDeposit.Half).mul(rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount())
        );
    }

    // Get the capacity of the next available minipool
    // Returns 0 if no minipools are available
    function getNextCapacity() override public view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        if (getLength(MinipoolDeposit.Half) > 0) { return rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount(); }
        if (getLength(MinipoolDeposit.Full) > 0) { return rocketDAOProtocolSettingsMinipool.getFullDepositUserAmount(); }
        if (getLength(MinipoolDeposit.Empty) > 0) { return rocketDAOProtocolSettingsMinipool.getEmptyDepositUserAmount(); }
        return 0;
    }

    // Get the deposit type of the next available minipool and the number of deposits in that queue
    // Returns None if no minipools are available
    function getNextDeposit() override public view returns (MinipoolDeposit, uint256) {
        uint256 length = getLength(MinipoolDeposit.Half);
        if (length > 0) { return (MinipoolDeposit.Half, length); }
        length = getLength(MinipoolDeposit.Full);
        if (length > 0) { return (MinipoolDeposit.Full, length); }
        length = getLength(MinipoolDeposit.Empty);
        if (length > 0) { return (MinipoolDeposit.Empty, length); }
        return (MinipoolDeposit.None, 0);
    }

    // Add a minipool to the end of the appropriate queue
    // Only accepts calls from the RocketMinipoolManager contract
    function enqueueMinipool(MinipoolDeposit _depositType, address _minipool) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketMinipoolManager", msg.sender) {
        if (_depositType == MinipoolDeposit.Full) { return enqueueMinipool("minipools.available.full", _minipool); }
        if (_depositType == MinipoolDeposit.Half) { return enqueueMinipool("minipools.available.half", _minipool); }
        if (_depositType == MinipoolDeposit.Empty) { return enqueueMinipool("minipools.available.empty", _minipool); }
        require(false, "Invalid minipool deposit type");
    }
    function enqueueMinipool(string memory _queueId, address _minipool) private {
        // Enqueue
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.enqueueItem(keccak256(abi.encodePacked(_queueId)), _minipool);
        // Emit enqueued event
        emit MinipoolEnqueued(_minipool, keccak256(abi.encodePacked(_queueId)), block.timestamp);
    }

    // Remove the first available minipool from the highest priority queue and return its address
    // Only accepts calls from the RocketDepositPool contract
    function dequeueMinipool() override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) returns (address minipoolAddress) {
        if (getLength(MinipoolDeposit.Half) > 0) { return dequeueMinipool("minipools.available.half"); }
        if (getLength(MinipoolDeposit.Full) > 0) { return dequeueMinipool("minipools.available.full"); }
        if (getLength(MinipoolDeposit.Empty) > 0) { return dequeueMinipool("minipools.available.empty"); }
        require(false, "No minipools are available");
    }
    function dequeueMinipoolByDeposit(MinipoolDeposit _depositType) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) returns (address minipoolAddress) {
        if (_depositType == MinipoolDeposit.Half) { return dequeueMinipool("minipools.available.half"); }
        if (_depositType == MinipoolDeposit.Full) { return dequeueMinipool("minipools.available.full"); }
        if (_depositType == MinipoolDeposit.Empty) { return dequeueMinipool("minipools.available.empty"); }
        require(false, "No minipools are available");
    }
    function dequeueMinipool(string memory _queueId) private returns (address) {
        // Dequeue
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        address minipool = addressQueueStorage.dequeueItem(keccak256(abi.encodePacked(_queueId)));
        // Emit dequeued event
        emit MinipoolDequeued(minipool, keccak256(abi.encodePacked(_queueId)), block.timestamp);
        // Return
        return minipool;
    }

    // Remove a minipool from a queue
    // Only accepts calls from registered minipools
    function removeMinipool(MinipoolDeposit _depositType) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Remove minipool from queue
        if (_depositType == MinipoolDeposit.Full) { return removeMinipool("minipools.available.full", msg.sender); }
        if (_depositType == MinipoolDeposit.Half) { return removeMinipool("minipools.available.half", msg.sender); }
        if (_depositType == MinipoolDeposit.Empty) { return removeMinipool("minipools.available.empty", msg.sender); }
        require(false, "Invalid minipool deposit type");
    }
    function removeMinipool(string memory _queueId, address _minipool) private {
        // Remove
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.removeItem(keccak256(abi.encodePacked(_queueId)), _minipool);
        // Emit removed event
        emit MinipoolRemoved(_minipool, keccak256(abi.encodePacked(_queueId)), block.timestamp);
    }

}
