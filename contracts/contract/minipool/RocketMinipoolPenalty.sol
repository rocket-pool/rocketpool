pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolPenaltyInterface.sol";

// Non-upgradable contract which gives guardian control over maximum penalty rates

contract RocketMinipoolPenalty is RocketBase, RocketMinipoolPenaltyInterface {

    // Events
    event MaxPenaltyRateUpdated(uint256 rate, uint256 time);

    // Libs
    using SafeMath for uint;

    // Storage (purposefully does not use RocketStorage to prevent oDAO from having power over this feature)
    uint256 maxPenaltyRate = 0 ether;                     // The most the oDAO is allowed to penalty a minipool (as a percentage)

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
    }

    // Get/set the current max penalty rate
    function setMaxPenaltyRate(uint256 _rate) external override onlyGuardian {
        // Update rate
        maxPenaltyRate = _rate;
        // Emit event
        emit MaxPenaltyRateUpdated(_rate, block.timestamp);
    }
    function getMaxPenaltyRate() external override view returns (uint256) {
        return maxPenaltyRate;
    }

    // Retrieves the amount to penalty a minipool
    function getPenaltyRate(address _minipoolAddress) external override view returns(uint256) {
        // Quick out which avoids a call to RocketStorage
        if (maxPenaltyRate == 0) {
             return 0;
        }
        // Retrieve penalty rate for this minipool
        uint256 penaltyRate = getUint(keccak256(abi.encodePacked("minipool.penalty.rate", _minipoolAddress)));
        // min(maxPenaltyRate, penaltyRate)
        if (penaltyRate > maxPenaltyRate) {
            return maxPenaltyRate;
        }
        return penaltyRate;
    }

    // Sets the penalty rate for the given minipool
    function setPenaltyRate(address _minipoolAddress, uint256 _rate) external override onlyLatestNetworkContract {
        setUint(keccak256(abi.encodePacked("minipool.penalty.rate", _minipoolAddress)), _rate);
    }
}
