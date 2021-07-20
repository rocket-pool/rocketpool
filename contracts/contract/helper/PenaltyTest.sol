pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolPenaltyInterface.sol";

// THIS CONTRACT IS NOT DEPLOYED TO MAINNET

// Helper contract used in unit tests that can set the penalty rate on a minipool (a feature that will be implemented at a later time)
contract PenaltyTest is RocketBase {
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
    }

    // Sets the penalty rate for the given minipool
    function setPenaltyRate(address _minipoolAddress, uint256 _rate) external {
        RocketMinipoolPenaltyInterface rocketMinipoolPenalty = RocketMinipoolPenaltyInterface(getContractAddress("rocketMinipoolPenalty"));
        rocketMinipoolPenalty.setPenaltyRate(_minipoolAddress, _rate);
    }
}
