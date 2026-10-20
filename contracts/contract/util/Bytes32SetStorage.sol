// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {Bytes32SetStorageInterface} from "../../interface/util/Bytes32SetStorageInterface.sol";

/// @notice Unordered bytes32 sets in RocketStorage, with constant-time reverse lookups and removal
contract Bytes32SetStorage is RocketBase, Bytes32SetStorageInterface {
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    function getCount(bytes32 _key) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(_key, ".count")));
    }

    /// @notice Returns an item by position; positions may change when items are removed
    function getItem(bytes32 _key, uint256 _index) override external view returns (bytes32) {
        require(_index < getCount(_key), "Index out of bounds");
        return getBytes32(keccak256(abi.encodePacked(_key, ".item", _index)));
    }

    /// @notice Returns -1 if the value is absent; zero is a valid set value
    function getIndexOf(bytes32 _key, bytes32 _value) override external view returns (int256) {
        uint256 index = getUint(keccak256(abi.encodePacked(_key, ".index", _value)));
        return index == 0 ? int256(-1) : int256(index - 1);
    }

    function addItem(bytes32 _key, bytes32 _value) override external onlyLatestContract("bytes32SetStorage", address(this)) onlyLatestNetworkContract {
        bytes32 indexKey = keccak256(abi.encodePacked(_key, ".index", _value));
        require(getUint(indexKey) == 0, "Item already exists in set");
        uint256 count = getCount(_key);
        setBytes32(keccak256(abi.encodePacked(_key, ".item", count)), _value);
        setUint(indexKey, count + 1);
        setUint(keccak256(abi.encodePacked(_key, ".count")), count + 1);
    }

    /// @dev Moves the tail into the removed position and clears the old tail slot
    function removeItem(bytes32 _key, bytes32 _value) override external onlyLatestContract("bytes32SetStorage", address(this)) onlyLatestNetworkContract {
        bytes32 indexKey = keccak256(abi.encodePacked(_key, ".index", _value));
        uint256 index = getUint(indexKey);
        require(index > 0, "Item does not exist in set");
        --index;
        uint256 lastIndex = getCount(_key) - 1;
        bytes32 lastItemKey = keccak256(abi.encodePacked(_key, ".item", lastIndex));
        if (index != lastIndex) {
            bytes32 lastItem = getBytes32(lastItemKey);
            setBytes32(keccak256(abi.encodePacked(_key, ".item", index)), lastItem);
            setUint(keccak256(abi.encodePacked(_key, ".index", lastItem)), index + 1);
        }
        deleteUint(indexKey);
        deleteBytes32(lastItemKey);
        setUint(keccak256(abi.encodePacked(_key, ".count")), lastIndex);
    }
}
