pragma solidity 0.7.6;

import "../../interface/RocketStorageInterface.sol";

// SPDX-License-Identifier: GPL-3.0-only

abstract contract RocketNodeDistributorStorageLayout {
    RocketStorageInterface rocketStorage;
    address nodeAddress;
    uint256 lock;   // Reentrancy guard
}