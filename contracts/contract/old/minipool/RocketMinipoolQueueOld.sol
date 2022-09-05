pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../../RocketBase.sol";
import "../../../interface/minipool/RocketMinipoolInterface.sol";
import "../../../interface/old/RocketMinipoolQueueInterfaceOld.sol";
import "../../../interface/old/RocketDAOProtocolSettingsMinipoolInterfaceOld.sol";
import "../../../interface/util/AddressQueueStorageInterface.sol";
import "../../../types/MinipoolDeposit.sol";

// Minipool queueing for deposit assignment

contract RocketMinipoolQueueOld is RocketBase, RocketMinipoolQueueInterfaceOld {

    // Libs
    using SafeMath for uint;

    // Constants
    bytes32 private constant queueKeyFull = keccak256("minipools.available.full");
    bytes32 private constant queueKeyHalf = keccak256("minipools.available.half");
    bytes32 private constant queueKeyEmpty = keccak256("minipools.available.empty");

    // Events
    event MinipoolEnqueued(address indexed minipool, bytes32 indexed queueId, uint256 time);
    event MinipoolDequeued(address indexed minipool, bytes32 indexed queueId, uint256 time);
    event MinipoolRemoved(address indexed minipool, bytes32 indexed queueId, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get the total combined length of the queues
    function getTotalLength() override external view returns (uint256) {
        return (
        getLength(queueKeyFull)
        ).add(
            getLength(queueKeyHalf)
        ).add(
            getLength(queueKeyEmpty)
        );
    }

    // Get the length of a queue
    // Returns 0 for invalid queues
    function getLength(MinipoolDeposit _depositType) override external view returns (uint256) {
        if (_depositType == MinipoolDeposit.Full) { return getLength(queueKeyFull); }
        if (_depositType == MinipoolDeposit.Half) { return getLength(queueKeyHalf); }
        if (_depositType == MinipoolDeposit.Empty) { return getLength(queueKeyEmpty); }
        return 0;
    }
    function getLength(bytes32 _key) private view returns (uint256) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        return addressQueueStorage.getLength(_key);
    }

    // Get the total combined capacity of the queues
    function getTotalCapacity() override external view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterfaceOld rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterfaceOld(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        return (
        getLength(queueKeyFull).mul(rocketDAOProtocolSettingsMinipool.getFullDepositUserAmount())
        ).add(
            getLength(queueKeyHalf).mul(rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount())
        ).add(
            getLength(queueKeyEmpty).mul(rocketDAOProtocolSettingsMinipool.getEmptyDepositUserAmount())
        );
    }

    // Get the total effective capacity of the queues (used in node demand calculation)
    function getEffectiveCapacity() override external view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterfaceOld rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterfaceOld(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        return (
        getLength(queueKeyFull).mul(rocketDAOProtocolSettingsMinipool.getFullDepositUserAmount())
        ).add(
            getLength(queueKeyHalf).mul(rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount())
        );
    }

    // Get the capacity of the next available minipool
    // Returns 0 if no minipools are available
    function getNextCapacity() override external view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterfaceOld rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterfaceOld(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        if (getLength(queueKeyHalf) > 0) { return rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount(); }
        if (getLength(queueKeyFull) > 0) { return rocketDAOProtocolSettingsMinipool.getFullDepositUserAmount(); }
        if (getLength(queueKeyEmpty) > 0) { return rocketDAOProtocolSettingsMinipool.getEmptyDepositUserAmount(); }
        return 0;
    }

    // Get the deposit type of the next available minipool and the number of deposits in that queue
    // Returns None if no minipools are available
    function getNextDeposit() override external view returns (MinipoolDeposit, uint256) {
        uint256 length = getLength(queueKeyHalf);
        if (length > 0) { return (MinipoolDeposit.Half, length); }
        length = getLength(queueKeyFull);
        if (length > 0) { return (MinipoolDeposit.Full, length); }
        length = getLength(queueKeyEmpty);
        if (length > 0) { return (MinipoolDeposit.Empty, length); }
        return (MinipoolDeposit.None, 0);
    }

    // Add a minipool to the end of the appropriate queue
    // Only accepts calls from the RocketMinipoolManager contract
    function enqueueMinipool(MinipoolDeposit _depositType, address _minipool) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketMinipoolManager", msg.sender) {
        if (_depositType == MinipoolDeposit.Half) { return enqueueMinipool(queueKeyHalf, _minipool); }
        if (_depositType == MinipoolDeposit.Full) { return enqueueMinipool(queueKeyFull, _minipool); }
        if (_depositType == MinipoolDeposit.Empty) { return enqueueMinipool(queueKeyEmpty, _minipool); }
        require(false, "Invalid minipool deposit type");
    }
    function enqueueMinipool(bytes32 _key, address _minipool) private {
        // Enqueue
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.enqueueItem(_key, _minipool);
        // Emit enqueued event
        emit MinipoolEnqueued(_minipool, _key, block.timestamp);
    }

    // Remove the first available minipool from the highest priority queue and return its address
    // Only accepts calls from the RocketDepositPool contract
    function dequeueMinipool() override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) returns (address minipoolAddress) {
        if (getLength(queueKeyHalf) > 0) { return dequeueMinipool(queueKeyHalf); }
        if (getLength(queueKeyFull) > 0) { return dequeueMinipool(queueKeyFull); }
        if (getLength(queueKeyEmpty) > 0) { return dequeueMinipool(queueKeyEmpty); }
        require(false, "No minipools are available");
    }
    function dequeueMinipoolByDeposit(MinipoolDeposit _depositType) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) returns (address minipoolAddress) {
        if (_depositType == MinipoolDeposit.Half) { return dequeueMinipool(queueKeyHalf); }
        if (_depositType == MinipoolDeposit.Full) { return dequeueMinipool(queueKeyFull); }
        if (_depositType == MinipoolDeposit.Empty) { return dequeueMinipool(queueKeyEmpty); }
        require(false, "No minipools are available");
    }
    function dequeueMinipool(bytes32 _key) private returns (address) {
        // Dequeue
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        address minipool = addressQueueStorage.dequeueItem(_key);
        // Emit dequeued event
        emit MinipoolDequeued(minipool, _key, block.timestamp);
        // Return
        return minipool;
    }

    // Remove a minipool from a queue
    // Only accepts calls from registered minipools
    function removeMinipool(MinipoolDeposit _depositType) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Remove minipool from queue
        if (_depositType == MinipoolDeposit.Half) { return removeMinipool(queueKeyHalf, msg.sender); }
        if (_depositType == MinipoolDeposit.Full) { return removeMinipool(queueKeyFull, msg.sender); }
        if (_depositType == MinipoolDeposit.Empty) { return removeMinipool(queueKeyEmpty, msg.sender); }
        require(false, "Invalid minipool deposit type");
    }
    function removeMinipool(bytes32 _key, address _minipool) private {
        // Remove
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.removeItem(_key, _minipool);
        // Emit removed event
        emit MinipoolRemoved(_minipool, _key, block.timestamp);
    }

}