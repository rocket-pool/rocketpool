pragma solidity 0.8.30;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/network/RocketNetworkSnapshotsTimeInterface.sol";

// THIS CONTRACT IS NOT DEPLOYED TO MAINNET

// Helper contract used to insert arbitrary snapshots in for testing
contract SnapshotTimeTest is RocketBase {

    RocketNetworkSnapshotsTimeInterface snapshots;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        snapshots = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
    }

    function push(string calldata _key, uint192 _value) external {
        bytes32 key = keccak256(abi.encodePacked(_key));

        snapshots.push(key, _value);
    }

    function lookup(string calldata _key, uint64 _time) external view returns (uint192){
        bytes32 key = keccak256(abi.encodePacked(_key));
        return snapshots.lookup(key, _time);
    }

    function lookupRecent(string calldata _key, uint64 _time, uint256 _recency) external view returns (uint192) {
        bytes32 key = keccak256(abi.encodePacked(_key));
        return snapshots.lookupRecent(key, _time, _recency);
    }

    function lookupGas(string calldata _key, uint64 _time) external view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(_key));
        uint256 gasBefore = gasleft();
        snapshots.lookup(key, _time);
        return gasBefore - gasleft();
    }

    function lookupRecentGas(string calldata _key, uint64 _time, uint256 _recency) external view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(_key));
        uint256 gasBefore = gasleft();
        snapshots.lookupRecent(key, _time, _recency);
        return gasBefore - gasleft();
    }
}
