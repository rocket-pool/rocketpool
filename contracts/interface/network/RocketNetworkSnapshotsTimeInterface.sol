// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

/// @notice Accounting for snapshotting of values based on block timestamps
interface RocketNetworkSnapshotsTimeInterface {
    struct Checkpoint192 {
        uint64 _time;
        uint192 _value;
    }

    function push(bytes32 _key, uint192 _value) external;
    function length(bytes32 _key) external view returns (uint256);
    function latest(bytes32 _key) external view returns (bool exists, uint64 time, uint192 value);
    function latestTime(bytes32 _key) external view returns (uint64);
    function latestValue(bytes32 _key) external view returns (uint192);
    function lookup(bytes32 _key, uint64 _time) external view returns (uint192);
    function lookupCheckpoint(bytes32 _key, uint64 _time) external view returns (bool exists, uint64 time, uint192 value);
    function lookupRecent(bytes32 _key, uint64 _time, uint256 _recency) external view returns (uint192);
}
