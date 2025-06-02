// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {BlockRootsInterface} from "../../interface/util/BlockRootsInterface.sol";

/// @dev NOT USED IN PRODUCTION - This contract only exists to mock beacon block roots
contract BlockRootsMock is BlockRootsInterface {
    mapping(uint64 => bytes32) internal blockRoots;

    constructor() {}

    function setBlockRoot(uint64 _slot, bytes32 _root) external {
        blockRoots[_slot] = _root;
    }

    function getBlockRoot(uint64 _slot) public override view returns (bytes32) {
        return blockRoots[_slot];
    }
}
