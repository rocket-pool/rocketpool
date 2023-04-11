// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/util/AddressQueueStorageInterface.sol";
import "../../types/MinipoolDeposit.sol";

/// @notice Minipool queueing for deposit assignment
contract RocketMinipoolQueue is RocketBase, RocketMinipoolQueueInterface {

    // Libs
    using SafeMath for uint;
    using SignedSafeMath for int;

    // Constants
    bytes32 private constant queueKeyFull = keccak256("minipools.available.full");
    bytes32 private constant queueKeyHalf = keccak256("minipools.available.half");
    bytes32 private constant queueKeyVariable = keccak256("minipools.available.variable");

    // Events
    event MinipoolEnqueued(address indexed minipool, bytes32 indexed queueId, uint256 time);
    event MinipoolDequeued(address indexed minipool, bytes32 indexed queueId, uint256 time);
    event MinipoolRemoved(address indexed minipool, bytes32 indexed queueId, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    /// @notice Get the total combined length of the queues
    function getTotalLength() override external view returns (uint256) {
        return (
            getLengthLegacy(queueKeyFull)
        ).add(
            getLengthLegacy(queueKeyHalf)
        ).add(
            getLength()
        );
    }

    /// @notice Returns true if there are any legacy minipools in the queue
    function getContainsLegacy() override external view returns (bool) {
        return getLengthLegacy(queueKeyFull).add(getLengthLegacy(queueKeyHalf)) > 0;
    }

    /// @notice Get the length of a given queue. Returns 0 for invalid queues
    /// @param _depositType Which queue to query the length of
    function getLengthLegacy(MinipoolDeposit _depositType) override external view returns (uint256) {
        if (_depositType == MinipoolDeposit.Full) { return getLengthLegacy(queueKeyFull); }
        if (_depositType == MinipoolDeposit.Half) { return getLengthLegacy(queueKeyHalf); }
        return 0;
    }

    /// @dev Returns a queue length by internal key representation
    /// @param _key The internal key representation of the queue to query the length of
    function getLengthLegacy(bytes32 _key) private view returns (uint256) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        return addressQueueStorage.getLength(_key);
    }

    /// @notice Gets the length of the variable (global) queue
    function getLength() override public view returns (uint256) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        return addressQueueStorage.getLength(queueKeyVariable);
    }

    /// @notice Get the total combined capacity of the queues
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

    /// @notice Get the total effective capacity of the queues (used in node demand calculation)
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

    /// @dev Get the ETH capacity of the variable queue
    function getVariableCapacity() internal view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        return getLength().mul(rocketDAOProtocolSettingsMinipool.getVariableDepositAmount());
    }

    /// @notice Get the capacity of the next available minipool. Returns 0 if no minipools are available
    function getNextCapacityLegacy() override external view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        if (getLengthLegacy(queueKeyHalf) > 0) { return rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount(); }
        if (getLengthLegacy(queueKeyFull) > 0) { return rocketDAOProtocolSettingsMinipool.getFullDepositUserAmount(); }
        return 0;
    }

    /// @notice Get the deposit type of the next available minipool and the number of deposits in that queue.
    ///         Returns None if no minipools are available
    function getNextDepositLegacy() override external view returns (MinipoolDeposit, uint256) {
        uint256 length = getLengthLegacy(queueKeyHalf);
        if (length > 0) { return (MinipoolDeposit.Half, length); }
        length = getLengthLegacy(queueKeyFull);
        if (length > 0) { return (MinipoolDeposit.Full, length); }
        return (MinipoolDeposit.None, 0);
    }

    /// @dev Add a minipool to the end of the appropriate queue. Only accepts calls from the RocketMinipoolManager contract
    /// @param _minipool Address of the minipool to add to the queue
    function enqueueMinipool(address _minipool) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Enqueue
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.enqueueItem(queueKeyVariable, _minipool);
        // Emit enqueued event
        emit MinipoolEnqueued(_minipool, queueKeyVariable, block.timestamp);
    }

    /// @dev Dequeues a minipool from a legacy queue
    /// @param _depositType The queue to dequeue a minipool from
    function dequeueMinipoolByDepositLegacy(MinipoolDeposit _depositType) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) returns (address minipoolAddress) {
        if (_depositType == MinipoolDeposit.Half) { return dequeueMinipool(queueKeyHalf); }
        if (_depositType == MinipoolDeposit.Full) { return dequeueMinipool(queueKeyFull); }
        require(false, "No minipools are available");
    }

    /// @dev Dequeues multiple minipools from the variable queue and returns them all
    /// @param _maxToDequeue The maximum number of items to dequeue
    function dequeueMinipools(uint256 _maxToDequeue) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) returns (address[] memory minipoolAddress) {
        uint256 queueLength = getLength();
        uint256 count = _maxToDequeue;
        if (count > queueLength) {
            count = queueLength;
        }
        address[] memory minipoolAddresses = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            RocketMinipoolInterface minipool = RocketMinipoolInterface(dequeueMinipool(queueKeyVariable));
            minipoolAddresses[i] = address(minipool);
        }
        return minipoolAddresses;
    }

    /// @dev Dequeues a minipool from a queue given an internal key
    /// @param _key The internal key representation of the queue from which to dequeue a minipool from
    function dequeueMinipool(bytes32 _key) private returns (address) {
        // Dequeue
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        address minipool = addressQueueStorage.dequeueItem(_key);
        // Emit dequeued event
        emit MinipoolDequeued(minipool, _key, block.timestamp);
        // Return
        return minipool;
    }

    /// @dev Remove a minipool from a queue. Only accepts calls from registered minipools
    function removeMinipool(MinipoolDeposit _depositType) override external onlyLatestContract("rocketMinipoolQueue", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Remove minipool from queue
        if (_depositType == MinipoolDeposit.Half) { return removeMinipool(queueKeyHalf, msg.sender); }
        if (_depositType == MinipoolDeposit.Full) { return removeMinipool(queueKeyFull, msg.sender); }
        if (_depositType == MinipoolDeposit.Variable) { return removeMinipool(queueKeyVariable, msg.sender); }
        require(false, "Invalid minipool deposit type");
    }

    /// @dev Removes a minipool from a queue given an internal key
    /// @param _key The internal key representation of the queue from which to remove a minipool from
    /// @param _minipool The address of a minipool to remove from the specified queue
    function removeMinipool(bytes32 _key, address _minipool) private {
        // Remove
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.removeItem(_key, _minipool);
        // Emit removed event
        emit MinipoolRemoved(_minipool, _key, block.timestamp);
    }

    /// @notice Returns the minipool address of the minipool in the global queue at a given index
    /// @param _index The index into the queue to retrieve
    function getMinipoolAt(uint256 _index) override external view returns(address) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));

        // Check if index is in the half queue
        uint256 halfLength = addressQueueStorage.getLength(queueKeyHalf);
        if (_index < halfLength) {
            return addressQueueStorage.getItem(queueKeyHalf, _index);
        }
        _index = _index.sub(halfLength);

        // Check if index is in the full queue
        uint256 fullLength = addressQueueStorage.getLength(queueKeyFull);
        if (_index < fullLength) {
            return addressQueueStorage.getItem(queueKeyFull, _index);
        }
        _index = _index.sub(fullLength);

        // Check if index is in the full queue
        uint256 variableLength = addressQueueStorage.getLength(queueKeyVariable);
        if (_index < variableLength) {
            return addressQueueStorage.getItem(queueKeyVariable, _index);
        }

        // Index is out of bounds
        return address(0);
    }

    /// @notice Returns the position a given minipool is in the queue
    /// @param _minipool The minipool to query the position of
    function getMinipoolPosition(address _minipool) override external view returns (int256) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        int256 position;

        // Check in half queue
        position = addressQueueStorage.getIndexOf(queueKeyHalf, _minipool);
        if (position != -1) {
            return position;
        }
        int256 offset = SafeCast.toInt256(addressQueueStorage.getLength(queueKeyHalf));

        // Check in full queue
        position = addressQueueStorage.getIndexOf(queueKeyFull, _minipool);
        if (position != -1) {
            return offset.add(position);
        }
        offset = offset.add(SafeCast.toInt256(addressQueueStorage.getLength(queueKeyFull)));

        // Check in variable queue
        position = addressQueueStorage.getIndexOf(queueKeyVariable, _minipool);
        if (position != -1) {
            return offset.add(position);
        }

        // Isn't in the queue
        return -1;
    }
}
