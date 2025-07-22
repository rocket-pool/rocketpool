// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {BlockRootsInterface} from "../../interface/util/BlockRootsInterface.sol";

contract BlockRoots is BlockRootsInterface {
    // Immutables
                                                                    // Mainnet values:
    uint256 internal immutable genesisBlockTimestamp;               // 1606824023
    uint256 internal immutable secondsPerSlot;                      // 12
    uint256 internal immutable beaconRootsHistoryBufferLength;      // 8191
    address internal immutable beaconRoots;                         // 0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02

    // Construct
    constructor(uint256 _genesisBlockTimestamp, uint256 _secondsPerSlot, uint256 _beaconRootsHistoryBufferLength, address _beaconRoots) {
        genesisBlockTimestamp = _genesisBlockTimestamp;
        secondsPerSlot = _secondsPerSlot;
        beaconRootsHistoryBufferLength = _beaconRootsHistoryBufferLength;
        beaconRoots = _beaconRoots;
    }

    /// @notice Attempts to retrieve the block root for a specified slot
    /// @param _slot Slot to lookup block root for
    function getBlockRoot(uint64 _slot) external override view returns (bytes32) {
        // Make sure the slot is recent enough that it will exist in the beaconRoots contract
        uint256 slotTimestamp = getTimestampFromSlot(_slot + 1);
        uint256 earliestTimestamp = block.timestamp - (beaconRootsHistoryBufferLength * secondsPerSlot);
        require (slotTimestamp > earliestTimestamp, "Slot too old");
        // Walk forwards from the given timestamp 1 slot at a time until block root is found
        while (slotTimestamp <= block.timestamp) {
            (bool success, bytes memory result) = beaconRoots.staticcall(abi.encode(slotTimestamp));
            if (success && result.length > 0) {
                return abi.decode(result, (bytes32));
            }
            unchecked {
                slotTimestamp += secondsPerSlot;
            }
        }
        // Fail
        revert("Block root is not available");
    }

    /// @dev Calculates a slot timestamp
    function getTimestampFromSlot(uint64 _slot) internal view returns (uint256) {
        return genesisBlockTimestamp + (uint256(_slot) * secondsPerSlot);
    }
}
