// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;
pragma abicoder v2;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {LinkedListStorage} from "./LinkedListStorage.sol";

/// @notice A linked list storage helper to test internal functions
contract LinkedListStorageHelper is LinkedListStorage {
    
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) LinkedListStorage(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Add an item to the end of the list. Requires that the item does not exist in the list
    /// @param _namespace defines the queue to be used
    /// @param _item the deposit queue item
    function enqueueItem(bytes32 _namespace, DepositQueueValue memory _item) public override {
        _enqueueItem(_namespace, _item);
    }

    /// @notice Remove an item from the start of a queue and return it. Requires that the queue is not empty
    /// @param _namespace defines the queue to be used
    function dequeueItem(bytes32 _namespace) public virtual override  returns (DepositQueueValue memory item) {
        return _dequeueItem(_namespace);
    }

    /// @notice Removes an item from a queue. Requires that the item exists in the queue
    /// @param _namespace to be used
    /// @param _key to be removed from the queue
    function removeItem(bytes32 _namespace,  DepositQueueKey memory _key) public virtual override {
        return _removeItem(_namespace, _key);
    }

    function packItem(DepositQueueValue memory _item) public pure returns (uint256 packed) {
        return _packItem(_item);
    }

    function unpackItem(uint256 _item) public pure returns (DepositQueueValue memory item) {
        return _unpackItem(_item);
    }
}