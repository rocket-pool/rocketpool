pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolSlashingInterface.sol";

// THIS CONTRACT IS NOT DEPLOYED TO MAINNET

// Helper contract used in unit tests that can set the slash rate on a minipool (a feature that will be implemented at a later time)
contract SlashTest is RocketBase {
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
    }

    // Sets the slash rate for the given minipool
    function setSlashRate(address _minipoolAddress, uint256 _rate) external {
        RocketMinipoolSlashingInterface rocketMinipoolSlashing = RocketMinipoolSlashingInterface(getContractAddress("rocketMinipoolSlashing"));
        rocketMinipoolSlashing.setSlashRate(_minipoolAddress, _rate);
    }
}
