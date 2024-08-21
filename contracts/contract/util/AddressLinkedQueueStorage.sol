pragma solidity 0.8.18;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/util/AddressLinkedQueueStorageInterface.sol";

// Address linked queue storage helper for RocketStorage data (linked list implementation)
contract AddressLinkedQueueStorage is RocketBase, AddressLinkedQueueStorageInterface {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // The number of items in the list
    function getLength(bytes32 _key) override public view returns (uint) {
        return getUint(keccak256(abi.encodePacked(_key, ".length")));
    }

    // The item in a queue by index
    function getItem(bytes32 _key, uint _index) override external view returns (address) {
        uint index = getUint(keccak256(abi.encodePacked(_key, ".start"))) + _index;
        return getAddress(keccak256(abi.encodePacked(_key, ".item", index)));
    }

    // The index of an item in a queue
    // Returns -1 if the value is not found
    function getIndexOf(bytes32 _key, address _value) override external view returns (int) {
        uint index = getUint(keccak256(abi.encodePacked(_key, ".index", _value)));
        if (index > 0) {
            return int(index);
        }
        return -1;
    }

    // Finds an item index in a queue and returns the previous item
    // Returns 0 if the value is not found
    function getPreviousItem(bytes32 _key, address _value) external view returns (address) {
        uint index = getUint(keccak256(abi.encodePacked(_key, ".index", _value)));
        if (index > 0) {
            uint previousIndex = getUint(keccak256(abi.encodePacked(_key, ".prev", index)));
            return getAddress(keccak256(abi.encodePacked(_key, ".item", previousIndex)));
        }
        return address(0);
    }

    // Finds an item index in a queue and returns the previous item
    // Returns 0 if the value is not found
    function getNextItem(bytes32 _key, address _value) external view returns (address) {
        uint index = getUint(keccak256(abi.encodePacked(_key, ".index", _value)));
        if (index > 0) {
            uint nextIndex = getUint(keccak256(abi.encodePacked(_key, ".next", index)));
            return getAddress(keccak256(abi.encodePacked(_key, ".item", nextIndex)));
        }
        return address(0);
    }

    // Add an item to the end of the list
    // Requires that the item does not exist in the list
    function enqueueItem(bytes32 _key, address _value) virtual override external {
    // onlyLatestContract("addressLinkedListStorage", address(this)) onlyLatestNetworkContract {
        require(getUint(keccak256(abi.encodePacked(_key, ".index", _value))) == 0, "Item already exists in queue");
        uint endIndex = getUint(keccak256(abi.encodePacked(_key, ".end")));
        uint newIndex = endIndex + 1;

        if (endIndex > 0) {
            setUint(keccak256(abi.encodePacked(_key, ".next", endIndex)), newIndex);
            setUint(keccak256(abi.encodePacked(_key, ".prev", newIndex)), endIndex);
        } else {
            setUint(keccak256(abi.encodePacked(_key, ".start")), newIndex);
        }
        
        setAddress(keccak256(abi.encodePacked(_key, ".item", newIndex)), _value);
        setUint(keccak256(abi.encodePacked(_key, ".index", _value)), newIndex);
        setUint(keccak256(abi.encodePacked(_key, ".end")), newIndex);

        // Update the length of the queue
        setUint(keccak256(abi.encodePacked(_key, ".length")), getLength(_key) + 1);
    }

    // Remove an item from the start of a queue and return it
    // Requires that the queue is not empty
    function dequeueItem(bytes32 _key) public virtual override onlyLatestContract("addressLinkedListStorage", address(this)) onlyLatestNetworkContract returns (address) {
        require(getLength(_key) > 0, "Queue is empty");
        uint start = getUint(keccak256(abi.encodePacked(_key, ".start")));
        address item = getAddress(keccak256(abi.encodePacked(_key, ".item", start)));
        
        uint nextItem = getUint(keccak256(abi.encodePacked(_key, ".next", item)));
        setUint(keccak256(abi.encodePacked(_key, ".start")), nextItem);
        setUint(keccak256(abi.encodePacked(_key, ".index", item)), 0);

        if (nextItem > 0) {
            setUint(keccak256(abi.encodePacked(_key, ".prev", nextItem)), 0);
        } else {
            setUint(keccak256(abi.encodePacked(_key, ".end")), 0);
        }

        // Update the length of the queue
        setUint(keccak256(abi.encodePacked(_key, ".length")), getLength(_key) - 1);

        return item;
    }

    // Removes an item from a queue
    // Requires that the item exists in the queue
    function removeItem(bytes32 _key, address _value) public virtual override onlyLatestContract("addressLinkedListStorage", address(this)) onlyLatestNetworkContract {
        uint index = getUint(keccak256(abi.encodePacked(_key, ".index", _value)));
        require(index > 0, "Item does not exist in queue");
        
        uint prevIndex = getUint(keccak256(abi.encodePacked(_key, ".prev", index)));
        uint nextIndex = getUint(keccak256(abi.encodePacked(_key, ".next", index)));
        if (prevIndex > 0) {
            // Not the first item
            setUint(keccak256(abi.encodePacked(_key, ".next", prevIndex)), nextIndex);
        } else {
            // First item
            setUint(keccak256(abi.encodePacked(_key, ".start")), nextIndex);
            setUint(keccak256(abi.encodePacked(_key, ".prev", nextIndex)), 0);
        }

        if (nextIndex > 0) {
            // Not the last item
            setUint(keccak256(abi.encodePacked(_key, ".prev", nextIndex)), prevIndex);
        } else {
            // Last item
            setUint(keccak256(abi.encodePacked(_key, ".end")), prevIndex);
        }

        setUint(keccak256(abi.encodePacked(_key, ".index", _value)), 0);
        setUint(keccak256(abi.encodePacked(_key, ".next", index)), 0);
        setUint(keccak256(abi.encodePacked(_key, ".prev", index)), 0);

        // Update the length of the queue
        setUint(keccak256(abi.encodePacked(_key, ".length")), getLength(_key) - 1);
    }

}