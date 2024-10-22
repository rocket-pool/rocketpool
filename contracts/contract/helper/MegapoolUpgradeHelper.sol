// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../RocketBase.sol";
import {RocketMegapoolFactoryInterface} from "../../interface/megapool/RocketMegapoolFactoryInterface.sol";

import "hardhat/console.sol";

// THIS CONTRACT IS NOT DEPLOYED TO MAINNET

// Helper contract used to insert arbitrary snapshots in for testing
contract MegapoolUpgradeHelper is RocketBase {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
    }

    function upgradeDelegate(address _newDelegate) external {
        RocketMegapoolFactoryInterface rocketMegapoolFactory = RocketMegapoolFactoryInterface(getContractAddress("rocketMegapoolFactory"));
        rocketMegapoolFactory.upgradeDelegate(_newDelegate);
    }
}
