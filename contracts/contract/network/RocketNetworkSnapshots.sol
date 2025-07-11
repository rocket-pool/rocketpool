// SPDX-License-Identifier: MIT
// Copyright (c) 2016-2023 zOS Global Limited and contributors
// Adapted from OpenZeppelin `Checkpoints` contract
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {Math} from "@openzeppelin4/contracts/utils/math/Math.sol";

/// @notice Accounting for snapshotting of values based on block numbers
contract RocketNetworkSnapshots is RocketBase, RocketNetworkSnapshotsInterface {
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Set contract version
        version = 2;
        // Setup for if this contract is being deployed as part of a new instance deployment
        if (!rocketStorage.getDeployedStatus()) {
            _insert(keccak256("network.prices.rpl"), 0.01 ether);
            _insert(keccak256("node.voting.power.stake.maximum"), 1.5 ether);
        }
    }

    /// @notice Pushes a new value as at the current block
    /// @param _key Key of the set to insert value into
    /// @param _value New value to insert
    function push(bytes32 _key, uint224 _value) onlyLatestContract("rocketNetworkSnapshots", address(this)) onlyLatestNetworkContract external {
        _insert(_key, _value);
    }

    /// @notice Returns the number of snapshots for a given key
    /// @param _key Key to query
    function length(bytes32 _key) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("snapshot.length", _key)));
    }

    /// @notice Returns the latest entry in a given set
    /// @param _key Key to query latest entry for
    function latest(bytes32 _key) external view returns (bool exists, uint32 block, uint224 value) {
        uint256 len = length(_key);
        if (len == 0) {
            return (false, 0, 0);
        }
        Checkpoint224 memory checkpoint = _load(_key, len - 1);
        return (true, checkpoint._block, checkpoint._value);
    }

    /// @notice Returns the block of the latest entry in a set
    /// @param _key Key to query latest block for
    function latestBlock(bytes32 _key) external view returns (uint32) {
        uint256 len = length(_key);
        return len == 0 ? 0 : _blockAt(_key, len - 1);
    }

    /// @notice Returns the value of the latest entry in a set
    /// @param _key Key to query latest value for
    function latestValue(bytes32 _key) external view returns (uint224) {
        uint256 len = length(_key);
        return len == 0 ? 0 : _valueAt(_key, len - 1);
    }

    /// @notice Performs a binary lookup for the value at the given block
    /// @param _key Key to execute lookup for
    /// @param _block Block number to search for
    function lookup(bytes32 _key, uint32 _block) external view returns (uint224) {
        uint256 len = length(_key);
        uint256 pos = _binaryLookup(_key, _block, 0, len);
        return pos == 0 ? 0 : _valueAt(_key, pos - 1);
    }

    /// @notice Performs a binary lookup for the entry at the given block
    /// @param _key Key to execute lookup for
    /// @param _block Block number to search for
    function lookupCheckpoint(bytes32 _key, uint32 _block) external override view returns (bool exists, uint32 block, uint224 value) {
        uint256 len = length(_key);
        uint256 pos = _binaryLookup(_key, _block, 0, len);
        if (pos == 0) {
            return (false, 0, 0);
        }
        Checkpoint224 memory checkpoint = _load(_key, pos - 1);
        return (true, checkpoint._block, checkpoint._value);
    }

    /// @notice Performs a binary lookup with a recency bias for the value at the given block
    /// @param _key Key to execute lookup for
    /// @param _block Block number to search for
    function lookupRecent(bytes32 _key, uint32 _block, uint256 _recency) external view returns (uint224) {
        uint256 len = length(_key);

        uint256 low = 0;
        uint256 high = len;

        if (len > 5 && len > _recency) {
            uint256 mid = len - _recency;
            if (_block < _blockAt(_key, mid)) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        uint256 pos = _binaryLookup(_key, _block, low, high);

        return pos == 0 ? 0 : _valueAt(_key, pos - 1);
    }

    /// @dev Inserts a value into a snapshot set
    function _insert(bytes32 _key, uint224 _value) private {
        uint32 blockNumber = uint32(block.number);
        uint256 pos = length(_key);

        if (pos > 0) {
            Checkpoint224 memory last = _load(_key, pos - 1);

            // Checkpoint keys must be non-decreasing.
            require(last._block <= blockNumber, "Unordered snapshot insertion");

            // Update or push new checkpoint
            if (last._block == blockNumber) {
                last._value = _value;
                _set(_key, pos - 1, last);
            } else {
                _push(_key, Checkpoint224({_block: blockNumber, _value: _value}));
            }
        } else {
            _push(_key, Checkpoint224({_block: blockNumber, _value: _value}));
        }
    }

    function _binaryLookup(
        bytes32 _key,
        uint32 _block,
        uint256 _low,
        uint256 _high
    ) private view returns (uint256) {
        while (_low < _high) {
            uint256 mid = Math.average(_low, _high);
            if (_blockAt(_key, mid) > _block) {
                _high = mid;
            } else {
                _low = mid + 1;
            }
        }
        return _high;
    }

    /// @dev Loads and decodes a checkpoint entry
    function _load(bytes32 _key, uint256 _pos) private view returns (Checkpoint224 memory) {
        bytes32 key = bytes32(uint256(_key) + _pos);
        bytes32 raw = rocketStorage.getBytes32(key);
        Checkpoint224 memory result;
        result._block = uint32(uint256(raw) >> 224);
        result._value = uint224(uint256(raw));
        return result;
    }

    /// @dev Returns the block number of an entry at given position in the snapshot set
    function _blockAt(bytes32 _key, uint256 _pos) private view returns (uint32) {
        bytes32 key = bytes32(uint256(_key) + _pos);
        bytes32 raw = rocketStorage.getBytes32(key);
        return uint32(uint256(raw) >> 224);
    }

    /// @dev Returns the value at given position in the snapshot set
    function _valueAt(bytes32 _key, uint256 _pos) private view returns (uint224) {
        bytes32 key = bytes32(uint256(_key) + _pos);
        bytes32 raw = rocketStorage.getBytes32(key);
        return uint224(uint256(raw));
    }

    /// @dev Pushes a new entry into the checkpoint set
    function _push(bytes32 _key, Checkpoint224 memory _item) private {
        bytes32 lengthKey = keccak256(abi.encodePacked("snapshot.length", _key));
        uint256 snapshotLength = rocketStorage.getUint(lengthKey);
        bytes32 key = bytes32(uint256(_key) + snapshotLength);
        rocketStorage.setUint(lengthKey, snapshotLength + 1);
        rocketStorage.setBytes32(key, _encode(_item));
    }

    /// @dev Stores an entry into the checkpoint set
    function _set(bytes32 _key, uint256 _pos, Checkpoint224 memory _item) private {
        bytes32 key = bytes32(uint256(_key) + _pos);
        rocketStorage.setBytes32(key, _encode(_item));
    }

    /// @dev Encodes an entry into its 256 bit representation
    function _encode(Checkpoint224 memory _item) private pure returns (bytes32) {
        return bytes32(
            uint256(_item._block) << 224 | uint256(_item._value)
        );
    }
}
