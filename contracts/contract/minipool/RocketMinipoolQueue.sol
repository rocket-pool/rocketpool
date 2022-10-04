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

    // Constants
    bytes32 private constant queueKeyFull = keccak256("minipools.available.full");
    bytes32 private constant queueKeyHalf = keccak256("minipools.available.half");
    bytes32 private constant queueKeyVariable = keccak256("minipools.available.variable");

    // Events
    event MinipoolEnqueued(address indexed minipool, bytes32 indexed queueId, uint256 time);
    event MinipoolDequeued(address indexed minipool, bytes32 indexed queueId, uint256 time);
    event MinipoolRemoved(address indexed minipool, bytes32 indexed queueId, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    // Get the total combined length of the queues
    function getTotalLength() override external view returns (uint256) {
        return (
            getLengthLegacy(queueKeyFull)
        ).add(
            getLengthLegacy(queueKeyHalf)
        ).add(
            getLength()
        );
    }

    // Returns true if there are any legacy minipools in the queue
    function getContainsLegacy() override external view returns (bool) {
        return getLengthLegacy(queueKeyFull).add(getLengthLegacy(queueKeyHalf)) > 0;
    }

    // Get the length of a queue
    // Returns 0 for invalid queues
    function getLengthLegacy(MinipoolDeposit _depositType) override external view returns (uint256) {
        if (_depositType == MinipoolDeposit.Full) { return getLengthLegacy(queueKeyFull); }
        if (_depositType == MinipoolDeposit.Half) { return getLengthLegacy(queueKeyHalf); }
        return 0;
    }
    function getLengthLegacy(bytes32 _key) private view returns (uint256) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        return addressQueueStorage.getLength(_key);
    }

    // Gets the length of the variable (global) queue
    function getLength() override public view returns (uint256) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        return addressQueueStorage.getLength(queueKeyVariable);
    }

    // Get the total combined capacity of the queues
    function getTotalCapacity() override external view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        return (
            getLengthLegacy(queueKeyFull).mul(rocketDAOProtocolSettingsMinipool.getFullDepositUserAmount())
        ).add(
            getLengthLegacy(queueKeyHalf).mul(rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount())
        ).add(
            getVariableCapacity()
        );
    }

    // Get the total effective capacity of the queues (used in node demand calculation)
    function getEffectiveCapacity() override external view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        return (
            getLengthLegacy(queueKeyFull).mul(rocketDAOProtocolSettingsMinipool.getFullDepositUserAmount())
        ).add(
            getLengthLegacy(queueKeyHalf).mul(rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount())
        ).add(
            getVariableCapacity()
        );
    }

    function getVariableCapacity() internal view returns (uint256) {
        return getUint("minipool.queue.variable.capacity");
    }

    // Get the capacity of the next available minipool
    // Returns 0 if no minipools are available
    function getNextCapacityLegacy() override external view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        if (getLengthLegacy(queueKeyHalf) > 0) { return rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount(); }
        if (getLengthLegacy(queueKeyFull) > 0) { return rocketDAOProtocolSettingsMinipool.getFullDepositUserAmount(); }
        return 0;
    }

    // Get the deposit type of the next available minipool and the number of deposits in that queue
    // Returns None if no minipools are available
    function getNextDepositLegacy() override external view returns (MinipoolDeposit, uint256) {
        uint256 length = getLengthLegacy(queueKeyHalf);
        if (length > 0) { return (MinipoolDeposit.Half, length); }
        length = getLengthLegacy(queueKeyFull);
        if (length > 0) { return (MinipoolDeposit.Full, length); }
        return (MinipoolDeposit.None, 0);
    }

    // Add a minipool to the end of the appropriate queue
    // Only accepts calls from the RocketMinipoolManager contract
    function enqueueMinipool(address _minipool) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Enqueue
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.enqueueItem(queueKeyVariable, _minipool);
        // Increase capacity value
        RocketMinipoolInterface rocketMinipool = RocketMinipoolInterface(_minipool);
        addUint("minipool.queue.variable.capacity", rocketMinipool.getNodeDepositBalance());
        // Emit enqueued event
        emit MinipoolEnqueued(_minipool, queueKeyVariable, block.timestamp);
    }

    function dequeueMinipoolByDepositLegacy(MinipoolDeposit _depositType) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) returns (address minipoolAddress) {
        if (_depositType == MinipoolDeposit.Half) { return dequeueMinipool(queueKeyHalf); }
        if (_depositType == MinipoolDeposit.Full) { return dequeueMinipool(queueKeyFull); }
        require(false, "No minipools are available");
    }
    function dequeueMinipools(uint256 _maxToDequeue) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) returns (address[] memory minipoolAddress) {
        uint256 queueLength = getLength();
        uint256 count = _maxToDequeue;
        if (count > queueLength) {
            count = queueLength;
        }
        address[] memory minipoolAddresses = new address[](count);
        uint256 capacity = 0;
        for (uint256 i = 0; i < count; i++) {
            RocketMinipoolInterface minipool = RocketMinipoolInterface(dequeueMinipool(queueKeyVariable));
            capacity = capacity.add(minipool.getNodeDepositBalance());
            minipoolAddresses[i] = address(minipool);
        }
        subUint("minipool.queue.variable.capacity", capacity);
        return minipoolAddresses;
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
        if (_depositType == MinipoolDeposit.Variable) { return removeMinipool(queueKeyVariable, msg.sender); }
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
