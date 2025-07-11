// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;
pragma abicoder v2;

import {LinkedListStorageInterface} from "../../interface/util/LinkedListStorageInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";

/// @notice A linked list storage helper for the deposit requests queue data
contract LinkedListStorage is RocketBase, LinkedListStorageInterface {

    // Constants for packing queue metadata into a single uint256
    uint256 constant internal startOffset = 256 - 64;
    uint256 constant internal endOffset = 256 - 128;
    uint256 constant internal lengthOffset = 256 - 192;

    // Constants for packing a deposit item (struct) into a single uint256
    uint256 constant internal receiverOffset = 256 - 160;
    uint256 constant internal indexOffset = 256 - 160 - 32;
    uint256 constant internal suppliedOffset = 256 - 160 - 32 - 32;

    uint64 constant internal ones64Bits = 0xFFFFFFFFFFFFFFFF;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice The number of items in the queue
    /// @param _namespace defines the queue to be used
    function getLength(bytes32 _namespace) override public view returns (uint256) {
        return uint64(getUint(keccak256(abi.encodePacked(_namespace, ".data"))) >> lengthOffset);
    }

    /// @notice The item in a queue by index
    /// @param _namespace defines the queue to be used
    /// @param _index the item index
    function getItem(bytes32 _namespace, uint256 _index) override external view returns (DepositQueueValue memory) {
        uint256 packedValue = getUint(keccak256(abi.encodePacked(_namespace, ".item", _index)));
        return _unpackItem(packedValue);
    }

    /// @notice The index of an item in a queue. Returns 0 if the value is not found
    /// @param _namespace defines the queue to be used
    /// @param _key the deposit queue value
    function getIndexOf(bytes32 _namespace, DepositQueueKey memory _key) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(_namespace, ".index", _key.receiver, _key.validatorId)));
    }

    /// @notice Returns the index of the item at the head of the list
    /// @param _namespace defines the queue to be used
    function getHeadIndex(bytes32 _namespace) override external view returns (uint256) {
        uint256 data = getUint(keccak256(abi.encodePacked(_namespace, ".data")));
        return uint64(data >> startOffset);
    }

    /// @notice Finds an item index in a queue and returns the previous item
    /// @param _namespace defines the queue to be used
    /// @param _value the deposit queue value
    function getPreviousItem(bytes32 _namespace, DepositQueueValue memory _value) external view returns (DepositQueueValue memory previousItem) {
        uint256 index = getUint(keccak256(abi.encodePacked(_namespace, ".index", _value.receiver, _value.validatorId)));
        if (index > 0) {
            uint256 previousIndex = getUint(keccak256(abi.encodePacked(_namespace, ".prev", index)));
            previousItem = _unpackItem(getUint(keccak256(abi.encodePacked(_namespace, ".item", previousIndex))));
        }
    }

    /// @notice Finds an item index in a queue and returns the next item
    /// @param _namespace defines the queue to be used
    /// @param _value the deposit queue value
    function getNextItem(bytes32 _namespace, DepositQueueValue memory _value) external view returns (DepositQueueValue memory nextItem) {
        uint256 index = getUint(keccak256(abi.encodePacked(_namespace, ".index", _value.receiver, _value.validatorId)));
        if (index > 0) {
            uint256 nextIndex = getUint(keccak256(abi.encodePacked(_namespace, ".next", index)));
            nextItem = _unpackItem(getUint(keccak256(abi.encodePacked(_namespace, ".item", nextIndex))));
        }
    }

    /// @notice Add an item to the end of the list. Requires that the item does not exist in the list
    /// @param _namespace defines the queue to be used
    /// @param _item the deposit queue item to be added
    function enqueueItem(bytes32 _namespace, DepositQueueValue memory _item) virtual override external onlyLatestContract("linkedListStorage", address(this)) onlyLatestNetworkContract {
        _enqueueItem(_namespace, _item);
    }

    /// @notice Internal function created to allow testing enqueueItem
    /// @param _namespace defines the queue to be used
    /// @param _item the deposit queue value
    function _enqueueItem(bytes32 _namespace, DepositQueueValue memory _item) internal {
        require(getUint(keccak256(abi.encodePacked(_namespace, ".index", _item.receiver, _item.validatorId))) == 0, "Item already exists in queue");
        uint256 data = getUint(keccak256(abi.encodePacked(_namespace, ".data")));
        uint256 endIndex = uint64(data >> endOffset);
        uint256 newIndex = endIndex + 1;

        if (endIndex > 0) {
            setUint(keccak256(abi.encodePacked(_namespace, ".next", endIndex)), newIndex);
            setUint(keccak256(abi.encodePacked(_namespace, ".prev", newIndex)), endIndex);
        } else {
            // clear the 64 bits used to stored the 'start' pointer
            data &= ~(uint256(ones64Bits) << startOffset);
            data |= newIndex << startOffset;
        }

        setUint(keccak256(abi.encodePacked(_namespace, ".item", newIndex)), _packItem(_item));
        setUint(keccak256(abi.encodePacked(_namespace, ".index", _item.receiver, _item.validatorId)), newIndex);
        // clear the 64 bits used to stored the 'end' pointer
        data &= ~(uint256(ones64Bits) << endOffset);
        data |= newIndex << endOffset;

        // Update the length of the queue
        uint256 currentLength = uint64(data >> lengthOffset);
        // clear the 64 bits used to stored the 'length' information
        data &= ~(uint256(ones64Bits) << lengthOffset);
        data |= (currentLength + 1) << lengthOffset;
        setUint(keccak256(abi.encodePacked(_namespace, ".data")), data);
    }

    /// @notice Remove an item from the start of a queue and return it. Requires that the queue is not empty
    /// @param _namespace defines the queue to be used
    function dequeueItem(bytes32 _namespace) public virtual override onlyLatestContract("linkedListStorage", address(this)) onlyLatestNetworkContract returns (DepositQueueValue memory item) {
        return _dequeueItem(_namespace);
    }

    /// @notice Returns the item from the start of the queue without removing it
    function peekItem(bytes32 _namespace) public virtual override view returns (DepositQueueValue memory item) {
        uint256 data = getUint(keccak256(abi.encodePacked(_namespace, ".data")));
        uint256 length = uint64(data >> lengthOffset);
        require(length > 0, "Queue can't be empty");
        uint256 start = uint64(data >> startOffset);
        uint256 packedItem = getUint(keccak256(abi.encodePacked(_namespace, ".item", start)));
        item = _unpackItem(packedItem);
    }

    /// @notice Remove an item from the start of a queue and return it. Requires that the queue is not empty
    /// @param _namespace defines the queue to be used
    function _dequeueItem(bytes32 _namespace) internal returns (DepositQueueValue memory item) {
        uint256 data = getUint(keccak256(abi.encodePacked(_namespace, ".data")));
        uint256 length = uint64(data >> lengthOffset);
        require(length > 0, "Queue can't be empty");
        uint256 start = uint64(data >> startOffset);
        uint256 packedItem = getUint(keccak256(abi.encodePacked(_namespace, ".item", start)));
        item = _unpackItem(packedItem);

        uint256 nextItem = getUint(keccak256(abi.encodePacked(_namespace, ".next", start)));
        // clear the 64 bits used to stored the 'start' pointer
        data &= ~(uint256(ones64Bits) << startOffset);
        data |= nextItem << startOffset;
        setUint(keccak256(abi.encodePacked(_namespace, ".index", item.receiver, item.validatorId)), 0);

        if (nextItem > 0) {
            setUint(keccak256(abi.encodePacked(_namespace, ".prev", nextItem)), 0);
        } else {
            // zero the 64 bits storing the 'end' pointer
            data &= ~(uint256(ones64Bits) << endOffset);
        }

        // Update the length of the queue
        // clear the 64 bits used to stored the 'length' information
        data &= ~(uint256(ones64Bits) << lengthOffset);
        data |= (length - 1) << lengthOffset;
        setUint(keccak256(abi.encodePacked(_namespace, ".data")), data);

        return item;
    }

    /// @notice Removes an item from a queue. Requires that the item exists in the queue
    /// @param _namespace defines the queue to be used
    /// @param _key to be removed from the queue
    function removeItem(bytes32 _namespace, DepositQueueKey memory _key) public virtual override onlyLatestContract("linkedListStorage", address(this)) onlyLatestNetworkContract {
        _removeItem(_namespace, _key);
    }

    /// @notice Internal function to remove an item from a queue. Requires that the item exists in the queue
    /// @param _namespace defines the queue to be used
    /// @param _key to be removed from the queue
    function _removeItem(bytes32 _namespace, DepositQueueKey memory _key) internal {
        uint256 index = getUint(keccak256(abi.encodePacked(_namespace, ".index", _key.receiver, _key.validatorId)));
        uint256 data = getUint(keccak256(abi.encodePacked(_namespace, ".data")));
        require(index > 0, "Item does not exist in queue");

        uint256 prevIndex = getUint(keccak256(abi.encodePacked(_namespace, ".prev", index)));
        uint256 nextIndex = getUint(keccak256(abi.encodePacked(_namespace, ".next", index)));
        if (prevIndex > 0) {
            // Not the first item
            setUint(keccak256(abi.encodePacked(_namespace, ".next", prevIndex)), nextIndex);
        } else {
            // First item
            // clear the 64 bits used to stored the 'start' pointer
            data &= ~(uint256(ones64Bits) << startOffset);
            data |= nextIndex << startOffset;
            setUint(keccak256(abi.encodePacked(_namespace, ".prev", nextIndex)), 0);
        }

        if (nextIndex > 0) {
            // Not the last item
            setUint(keccak256(abi.encodePacked(_namespace, ".prev", nextIndex)), prevIndex);
        } else {
            // Last item
            // clear the 64 bits used to stored the 'end' pointer
            data &= ~(uint256(ones64Bits) << endOffset);
            data |= prevIndex << endOffset;
        }

        setUint(keccak256(abi.encodePacked(_namespace, ".index", _key.receiver, _key.validatorId)), 0);
        setUint(keccak256(abi.encodePacked(_namespace, ".next", index)), 0);
        setUint(keccak256(abi.encodePacked(_namespace, ".prev", index)), 0);

        // Update the length of the queue
        uint256 currentLength = uint64(data >> lengthOffset);
        // clear the 64 bits used to stored the 'length' information
        data &= ~(uint256(ones64Bits) << lengthOffset);
        data |= (currentLength - 1) << lengthOffset;
        setUint(keccak256(abi.encodePacked(_namespace, ".data")), data);
    }

    /// @notice packs a deposit queue value into a single uint256
    /// @param _item the deposit queue item to be packed
    function _packItem(DepositQueueValue memory _item) internal pure returns (uint256 packed) {
        packed |= uint256(uint160(_item.receiver)) << receiverOffset;
        packed |= uint256(_item.validatorId) << indexOffset;
        packed |= uint256(_item.suppliedValue) << suppliedOffset;
        packed |= uint256(_item.requestedValue);
    }

    /// @notice unpacks an uint256 value into a deposit queue struct 
    /// @param _packedValue the packed deposit queue value 
    function _unpackItem(uint256 _packedValue) internal pure returns (DepositQueueValue memory item) {
        item.receiver = address(uint160(_packedValue >> receiverOffset));
        item.validatorId = uint32(_packedValue >> indexOffset);
        item.suppliedValue = uint32(_packedValue >> suppliedOffset);
        item.requestedValue = uint32(_packedValue);
    }

    /// @notice Returns the supplied number of entries starting at the supplied index
    /// @param _namespace The namespace of the linked list to scan
    /// @param _start The index to start from, or 0 to start from the start of the first item in the list
    /// @param _count The maximum number of items to return
    function scan(bytes32 _namespace, uint256 _start, uint256 _count) override external view returns (DepositQueueValue[] memory entries, uint256 nextIndex) {
        entries = new DepositQueueValue[](_count);
        nextIndex = _start;
        uint256 total = 0;

        // If nextIndex is 0, begin scan at the start of the list
        if (nextIndex == 0) {
            uint256 data = getUint(keccak256(abi.encodePacked(_namespace, ".data")));
            uint256 start = uint64(data >> startOffset);
            nextIndex = start;
        }

        while (total < _count && nextIndex != 0) {
            uint256 packedValue = getUint(keccak256(abi.encodePacked(_namespace, ".item", nextIndex)));
            entries[total] = _unpackItem(packedValue);
            nextIndex = getUint(keccak256(abi.encodePacked(_namespace, ".next", nextIndex)));
            total++;
        }

        assembly {
            mstore(entries, total)
        }

        return (entries, nextIndex);
    }
}