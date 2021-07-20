pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/util/AddressSetStorageInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

// Address set storage helper for RocketStorage data (contains unique items; has reverse index lookups)

contract AddressSetStorage is RocketBase, AddressSetStorageInterface {

    using SafeMath for uint;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // The number of items in a set
    function getCount(bytes32 _key) override external view returns (uint) {
        return getUint(keccak256(abi.encodePacked(_key, ".count")));
    }

    // The item in a set by index
    function getItem(bytes32 _key, uint _index) override external view returns (address) {
        return getAddress(keccak256(abi.encodePacked(_key, ".item", _index)));
    }

    // The index of an item in a set
    // Returns -1 if the value is not found
    function getIndexOf(bytes32 _key, address _value) override external view returns (int) {
        return int(getUint(keccak256(abi.encodePacked(_key, ".index", _value)))) - 1;
    }

    // Add an item to a set
    // Requires that the item does not exist in the set
    function addItem(bytes32 _key, address _value) override external onlyLatestContract("addressSetStorage", address(this)) onlyLatestNetworkContract {
        require(getUint(keccak256(abi.encodePacked(_key, ".index", _value))) == 0, "Item already exists in set");
        uint count = getUint(keccak256(abi.encodePacked(_key, ".count")));
        setAddress(keccak256(abi.encodePacked(_key, ".item", count)), _value);
        setUint(keccak256(abi.encodePacked(_key, ".index", _value)), count.add(1));
        setUint(keccak256(abi.encodePacked(_key, ".count")), count.add(1));
    }

    // Remove an item from a set
    // Swaps the item with the last item in the set and truncates it; computationally cheap
    // Requires that the item exists in the set
    function removeItem(bytes32 _key, address _value) override external onlyLatestContract("addressSetStorage", address(this)) onlyLatestNetworkContract {
        uint256 index = getUint(keccak256(abi.encodePacked(_key, ".index", _value)));
        require(index-- > 0, "Item does not exist in set");
        uint count = getUint(keccak256(abi.encodePacked(_key, ".count")));
        if (index < count.sub(1)) {
            address lastItem = getAddress(keccak256(abi.encodePacked(_key, ".item", count.sub(1))));
            setAddress(keccak256(abi.encodePacked(_key, ".item", index)), lastItem);
            setUint(keccak256(abi.encodePacked(_key, ".index", lastItem)), index.add(1));
        }
        setUint(keccak256(abi.encodePacked(_key, ".index", _value)), 0);
        setUint(keccak256(abi.encodePacked(_key, ".count")), count.sub(1));
    }

}
