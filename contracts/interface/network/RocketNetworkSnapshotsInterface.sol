// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

/// @notice Accounting for snapshotting of values based on block numbers
interface RocketNetworkSnapshotsInterface {
    struct Checkpoint224 {
        uint32 _block;
        uint224 _value;
    }

    function push(bytes32 _key, uint224 _value) external;
    function length(bytes32 _key) external view returns (uint256);
    function latest(bytes32 _key) external view returns (bool exists, uint32 block, uint224 value);
    function latestBlock(bytes32 _key) external view returns (uint32);
    function latestValue(bytes32 _key) external view returns (uint224);
    function lookup(bytes32 _key, uint32 _block) external view returns (uint224);
    function lookupCheckpoint(bytes32 _key, uint32 _block) external view returns (bool exists, uint32 block, uint224 value);
    function lookupRecent(bytes32 _key, uint32 _block, uint256 _recency) external view returns (uint224);
}
