// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../RocketBase.sol";
import {RocketMegapoolFactoryInterface} from "../../interface/megapool/RocketMegapoolFactoryInterface.sol";

/// @dev NOT USED IN PRODUCTION - Helper contract used to insert arbitrary snapshots in for testing
contract MegapoolUpgradeHelper is RocketBase {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
    }

    function upgradeDelegate(address _newDelegate) external onlyGuardian {
        RocketMegapoolFactoryInterface rocketMegapoolFactory = RocketMegapoolFactoryInterface(getContractAddress("rocketMegapoolFactory"));
        rocketMegapoolFactory.upgradeDelegate(_newDelegate);
    }
}
