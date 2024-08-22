pragma solidity 0.8.18;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/util/AddressLinkedQueueStorageInterface.sol";

/// @notice Address linked queue storage helper for RocketStorage data (linked list implementation)
contract AddressLinkedQueueStorage is RocketBase, AddressLinkedQueueStorageInterface {

    // Constants for packing queue metadata into a single uint256
    uint256 constant internal startOffset = 256 - 64;
    uint256 constant internal endOffset = 256 - 128;
    uint256 constant internal lengthOffset = 256 - 192;

    // Constants for packing a deposit queue struct into a single uint256
    uint256 constant internal receiverOffset = 256 - 160;
    uint256 constant internal indexOffset = 256 - 160 - 32;
    uint256 constant internal suppliedOffset = 256 - 160 - 32 - 32;
    
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice The number of items in the queue
    /// @param _namespace defines the queue to be used
    function getLength(bytes32 _namespace) override public view returns (uint) {
        return getUint(keccak256(abi.encodePacked(_namespace, ".data"))) >> lengthOffset;
    }

    /// @notice The item in a queue by index
    /// @param _namespace defines the queue to be used
    /// @param _index the item index
    function getItem(bytes32 _namespace, uint _index) override external view returns (DepositQueueValue memory) {
        uint index = getUint(keccak256(abi.encodePacked(_namespace, ".data"))) >> startOffset + _index;
        uint packedValue = getUint(keccak256(abi.encodePacked(_namespace, ".item", index)));
        return unpackDepositQueueValue(packedValue);
    }

    /// @notice The index of an item in a queue. Returns -1 if the value is not found
    /// @param _namespace defines the queue to be used
    /// @param _value the deposit queue value
    function getIndexOf(bytes32 _namespace, DepositQueueValue memory _value) override external view returns (int) {
        uint index = getUint(keccak256(abi.encodePacked(_namespace, ".index", _value.receiver, _value.validatorIndex)));
        if (index > 0) {
            return int(index);
        }
        return -1;
    }

    /// @notice Finds an item index in a queue and returns the previous item
    /// @param _namespace defines the queue to be used
    /// @param _value the deposit queue value
    function getPreviousItem(bytes32 _namespace, DepositQueueValue memory _value) external view returns (DepositQueueValue memory previousItem) {
        uint index = getUint(keccak256(abi.encodePacked(_namespace, ".index", _value.receiver, _value.validatorIndex)));
        if (index > 0) {
            uint previousIndex = getUint(keccak256(abi.encodePacked(_namespace, ".prev", index)));
            previousItem = unpackDepositQueueValue(getUint(keccak256(abi.encodePacked(_namespace, ".item", previousIndex))));
        }
    }

    /// @notice Finds an item index in a queue and returns the next item
    /// @param _namespace defines the queue to be used
    /// @param _value the deposit queue value
    function getNextItem(bytes32 _namespace, DepositQueueValue memory _value) external view returns (DepositQueueValue memory nextItem) {
        uint index = getUint(keccak256(abi.encodePacked(_namespace, ".index", _value.receiver, _value.validatorIndex)));
        if (index > 0) {
            uint nextIndex = getUint(keccak256(abi.encodePacked(_namespace, ".next", index)));
            nextItem = unpackDepositQueueValue(getUint(keccak256(abi.encodePacked(_namespace, ".item", nextIndex))));
        }
    }

    /// @notice Add an item to the end of the list. Requires that the item does not exist in the list
    /// @param _namespace defines the queue to be used
    /// @param _value the deposit queue value
    function enqueueItem(bytes32 _namespace, DepositQueueValue memory _value) virtual override external {
    // onlyLatestContract("addressLinkedListStorage", address(this)) onlyLatestNetworkContract {
        require(getUint(keccak256(abi.encodePacked(_namespace, ".index", _value.receiver, _value.validatorIndex))) == 0, "Item already exists in queue");
        uint data = getUint(keccak256(abi.encodePacked(_namespace, ".data")));
        uint endIndex = data >> endOffset;
        uint newIndex = endIndex + 1;

        if (endIndex > 0) {
            setUint(keccak256(abi.encodePacked(_namespace, ".next", endIndex)), newIndex);
            setUint(keccak256(abi.encodePacked(_namespace, ".prev", newIndex)), endIndex);
        } else {
            data |= newIndex << startOffset;
        }
        
        setUint(keccak256(abi.encodePacked(_namespace, ".item", newIndex)), packDepositQueueValue(_value));
        setUint(keccak256(abi.encodePacked(_namespace, ".index", _value.receiver, _value.validatorIndex)), newIndex);
        data |= newIndex << endOffset;

        // Update the length of the queue
        uint currentLength = data >> lengthOffset;
        data |= (currentLength + 1) << lengthOffset;
        setUint(keccak256(abi.encodePacked(_namespace, ".data")), data);
    }

    /// @notice Remove an item from the start of a queue and return it. Requires that the queue is not empty
    /// @param _namespace defines the queue to be used
    function dequeueItem(bytes32 _namespace) public virtual override onlyLatestContract("addressLinkedListStorage", address(this)) onlyLatestNetworkContract returns (address) {
        require(getLength(_namespace) > 0, "Queue is empty");
        uint data = getUint(keccak256(abi.encodePacked(_namespace, ".data")));
        uint start = data >> startOffset;
        address item = getAddress(keccak256(abi.encodePacked(_namespace, ".item", start)));
        
        uint nextItem = getUint(keccak256(abi.encodePacked(_namespace, ".next", item)));
        data |= nextItem << startOffset;
        setUint(keccak256(abi.encodePacked(_namespace, ".index", item)), 0);

        if (nextItem > 0) {
            setUint(keccak256(abi.encodePacked(_namespace, ".prev", nextItem)), 0);
        } else {
            data |= 0 << endOffset;
        }

        // Update the length of the queue
        uint currentLength = data >> lengthOffset;
        data |= (currentLength + 1) << lengthOffset;
        setUint(keccak256(abi.encodePacked(_namespace, ".data")), data);

        return item;
    }

    /// @notice Removes an item from a queue. Requires that the item exists in the queue
    /// @param _namespace defines the queue to be used
    function removeItem(bytes32 _namespace, DepositQueueValue memory _value) public virtual override onlyLatestContract("addressLinkedListStorage", address(this)) onlyLatestNetworkContract {
        uint index = getUint(keccak256(abi.encodePacked(_namespace, ".index", _value.receiver, _value.validatorIndex)));
        uint data = getUint(keccak256(abi.encodePacked(_namespace, ".data")));
        require(index > 0, "Item does not exist in queue");
        
        uint prevIndex = getUint(keccak256(abi.encodePacked(_namespace, ".prev", index)));
        uint nextIndex = getUint(keccak256(abi.encodePacked(_namespace, ".next", index)));
        if (prevIndex > 0) {
            // Not the first item
            setUint(keccak256(abi.encodePacked(_namespace, ".next", prevIndex)), nextIndex);
        } else {
            // First item
            data |= nextIndex << startOffset;
            setUint(keccak256(abi.encodePacked(_namespace, ".prev", nextIndex)), 0);
        }

        if (nextIndex > 0) {
            // Not the last item
            setUint(keccak256(abi.encodePacked(_namespace, ".prev", nextIndex)), prevIndex);
        } else {
            // Last item
            data |= prevIndex << endOffset;
        }

        setUint(keccak256(abi.encodePacked(_namespace, ".index", _value.receiver, _value.validatorIndex)), 0);
        setUint(keccak256(abi.encodePacked(_namespace, ".next", index)), 0);
        setUint(keccak256(abi.encodePacked(_namespace, ".prev", index)), 0);

        // Update the length of the queue
        uint currentLength = data >> lengthOffset;
        data |= (currentLength + 1) << lengthOffset;
        setUint(keccak256(abi.encodePacked(_namespace, ".data")), data);
    }

    /// @notice packs a deposit queue value into a single uint256
    /// @param _struct the deposit queue value to be packed
    function packDepositQueueValue(DepositQueueValue memory _struct) internal pure returns (uint256 packed) {
        packed |= uint256(uint160(_struct.receiver)) << receiverOffset;
        packed |= uint256(_struct.validatorIndex) << indexOffset;
        packed |= uint256(_struct.suppliedValue) << suppliedOffset;
        packed |= uint256(_struct.requestedValue);
    }

    /// @notice unpacks an uint256 value into a deposit queue struct 
    /// @param _packedValue the packed deposit queue value 
    function unpackDepositQueueValue(uint256 _packedValue) internal pure returns (DepositQueueValue memory value) {
        value.receiver = address(uint160(_packedValue >> receiverOffset));
        value.validatorIndex = uint32(_packedValue >> indexOffset);
        value.suppliedValue = uint32(_packedValue >> suppliedOffset);
        value.requestedValue = uint32(_packedValue);
    }

}