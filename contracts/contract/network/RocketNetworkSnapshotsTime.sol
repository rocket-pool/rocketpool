// SPDX-License-Identifier: MIT
// Copyright (c) 2016-2023 zOS Global Limited and contributors
// Adapted from OpenZeppelin `Checkpoints` contract
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNetworkSnapshotsTimeInterface} from "../../interface/network/RocketNetworkSnapshotsTimeInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {Math} from "@openzeppelin4/contracts/utils/math/Math.sol";

/// @notice Accounting for snapshotting of values based on block timestamps
contract RocketNetworkSnapshotsTime is RocketBase, RocketNetworkSnapshotsTimeInterface {
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Pushes a new value as at the current block timestamp
    /// @param _key Key of the set to insert value into
    /// @param _value New value to insert
    function push(bytes32 _key, uint192 _value) onlyLatestContract("rocketNetworkSnapshotsTime", address(this)) onlyLatestNetworkContract external {
        _insert(_key, _value);
    }

    /// @notice Returns the number of snapshots for a given key
    /// @param _key Key to query
    function length(bytes32 _key) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("snapshot.time.length", _key)));
    }

    /// @notice Returns the latest entry in a given set
    /// @param _key Key to query latest entry for
    function latest(bytes32 _key) external view returns (bool exists, uint64 time, uint192 value) {
        uint256 len = length(_key);
        if (len == 0) {
            return (false, 0, 0);
        }
        Checkpoint192 memory checkpoint = _load(_key, len - 1);
        return (true, checkpoint._time, checkpoint._value);
    }

    /// @notice Returns the timestamp of the latest entry in a set
    /// @param _key Key to query latest timestamp for
    function latestTime(bytes32 _key) external view returns (uint64) {
        uint256 len = length(_key);
        return len == 0 ? 0 : _timeAt(_key, len - 1);
    }

    /// @notice Returns the value of the latest entry in a set
    /// @param _key Key to query latest value for
    function latestValue(bytes32 _key) external view returns (uint192) {
        uint256 len = length(_key);
        return len == 0 ? 0 : _valueAt(_key, len - 1);
    }

    /// @notice Performs a binary lookup for the value at the given timestamp
    /// @param _key Key to execute lookup for
    /// @param _time Timestamp to search for
    function lookup(bytes32 _key, uint64 _time) external view returns (uint192) {
        uint256 len = length(_key);
        uint256 pos = _binaryLookup(_key, _time, 0, len);
        return pos == 0 ? 0 : _valueAt(_key, pos - 1);
    }

    /// @notice Performs a binary lookup for the entry at the given timestamp
    /// @param _key Key to execute lookup for
    /// @param _time Timestamp to search for
    function lookupCheckpoint(bytes32 _key, uint64 _time) external override view returns (bool exists, uint64 time, uint192 value) {
        uint256 len = length(_key);
        uint256 pos = _binaryLookup(_key, _time, 0, len);
        if (pos == 0) {
            return (false, 0, 0);
        }
        Checkpoint192 memory checkpoint = _load(_key, pos - 1);
        return (true, checkpoint._time, checkpoint._value);
    }

    /// @notice Performs a binary lookup with a recency bias for the value at the given timestamp
    /// @param _key Key to execute lookup for
    /// @param _time Timestamp to search for
    function lookupRecent(bytes32 _key, uint64 _time, uint256 _recency) external view returns (uint192) {
        uint256 len = length(_key);

        uint256 low = 0;
        uint256 high = len;

        if (len > 5 && len > _recency) {
            uint256 mid = len - _recency;
            if (_time < _timeAt(_key, mid)) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        uint256 pos = _binaryLookup(_key, _time, low, high);

        return pos == 0 ? 0 : _valueAt(_key, pos - 1);
    }

    /// @dev Inserts a value into a snapshot set
    function _insert(bytes32 _key, uint192 _value) internal {
        uint64 blockTimestamp = uint64(block.timestamp);
        uint256 pos = length(_key);

        if (pos > 0) {
            Checkpoint192 memory last = _load(_key, pos - 1);

            // Checkpoint keys must be non-decreasing.
            require(last._time <= blockTimestamp, "Unordered snapshot insertion");

            // Update or push new checkpoint
            if (last._time == blockTimestamp) {
                last._value = _value;
                _set(_key, pos - 1, last);
            } else {
                _push(_key, Checkpoint192({_time: blockTimestamp, _value: _value}));
            }
        } else {
            _push(_key, Checkpoint192({_time: blockTimestamp, _value: _value}));
        }
    }

    function _binaryLookup(
        bytes32 _key,
        uint64 _time,
        uint256 _low,
        uint256 _high
    ) internal view returns (uint256) {
        while (_low < _high) {
            uint256 mid = Math.average(_low, _high);
            if (_timeAt(_key, mid) > _time) {
                _high = mid;
            } else {
                _low = mid + 1;
            }
        }
        return _high;
    }

    /// @dev Loads and decodes a checkpoint entry
    function _load(bytes32 _key, uint256 _pos) internal view returns (Checkpoint192 memory) {
        bytes32 key = bytes32(uint256(_key) + _pos);
        bytes32 raw = rocketStorage.getBytes32(key);
        Checkpoint192 memory result;
        result._time = uint64(uint256(raw) >> 192);
        result._value = uint192(uint256(raw));
        return result;
    }

    /// @dev Returns the timestamp of an entry at given position in the snapshot set
    function _timeAt(bytes32 _key, uint256 _pos) internal view returns (uint64) {
        bytes32 key = bytes32(uint256(_key) + _pos);
        bytes32 raw = rocketStorage.getBytes32(key);
        return uint64(uint256(raw) >> 192);
    }

    /// @dev Returns the value at given position in the snapshot set
    function _valueAt(bytes32 _key, uint256 _pos) internal view returns (uint192) {
        bytes32 key = bytes32(uint256(_key) + _pos);
        bytes32 raw = rocketStorage.getBytes32(key);
        return uint192(uint256(raw));
    }

    /// @dev Pushes a new entry into the checkpoint set
    function _push(bytes32 _key, Checkpoint192 memory _item) internal {
        bytes32 lengthKey = keccak256(abi.encodePacked("snapshot.time.length", _key));
        uint256 snapshotLength = rocketStorage.getUint(lengthKey);
        bytes32 key = bytes32(uint256(_key) + snapshotLength);
        rocketStorage.setUint(lengthKey, snapshotLength + 1);
        rocketStorage.setBytes32(key, _encode(_item));
    }

    /// @dev Stores an entry into the checkpoint set
    function _set(bytes32 _key, uint256 _pos, Checkpoint192 memory _item) internal {
        bytes32 key = bytes32(uint256(_key) + _pos);
        rocketStorage.setBytes32(key, _encode(_item));
    }

    /// @dev Encodes an entry into its 256 bit representation
    function _encode(Checkpoint192 memory _item) internal pure returns (bytes32) {
        return bytes32(
            uint256(_item._time) << 192 | uint256(_item._value)
        );
    }
}
