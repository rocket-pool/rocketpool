// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

struct Checkpoint224 {
    uint32 _block;
    uint224 _value;
}

/// @notice Accounting for snapshotting of values based on block numbers
interface RocketNetworkSnapshotsInterface {
    function push(bytes32 _key, uint32 _block, uint224 _value) external returns (uint224, uint224);
    function length(bytes32 _key) external view returns (uint256);
    function latest(bytes32 _key) external view returns (bool, uint32, uint224);
    function latestBlock(bytes32 _key) external view returns (uint32);
    function latestValue(bytes32 _key) external view returns (uint224);
    function lookup(bytes32 _key, uint32 _block) external view returns (uint224);
    function lookupRecent(bytes32 _key, uint32 _block, uint256 _recency) external view returns (uint224);
}
