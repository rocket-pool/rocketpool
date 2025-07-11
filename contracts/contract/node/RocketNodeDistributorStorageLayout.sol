// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";

abstract contract RocketNodeDistributorStorageLayout {
    RocketStorageInterface internal rocketStorage;
    address internal nodeAddress;
    uint256 internal lock;   // Reentrancy guard
}