pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolSlashingInterface.sol";

// Non-upgradable contract which gives guardian control over maximum slash rates

contract RocketMinipoolSlashing is RocketBase, RocketMinipoolSlashingInterface {

    // Libs
    using SafeMath for uint;

    // Storage (purposefully does not use RocketStorage to prevent oDAO from having power over this feature)
    uint256 maxSlashRate = 0 ether;                     // The most the oDAO is allowed to slash a minipool (as a percentage)

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
    }

    // Get/set the current max slash rate
    function setMaxSlashRate(uint256 _rate) external override onlyGuardian {
        maxSlashRate = _rate;
    }
    function getMaxSlashRate() external override view returns (uint256) {
        return maxSlashRate;
    }

    // Retrieves the amount to slash a minipool
    function getSlashRate(address _minipoolAddress) external override view returns(uint256) {
        // Quick out which avoids a call to RocketStorage
        if (maxSlashRate == 0) {
             return 0;
        }
        // Retrieve slash rate for this minipool
        uint256 slashRate = getUint(keccak256(abi.encodePacked("minipool.slash.rate", _minipoolAddress)));
        // min(maxSlashRate, slashRate)
        if (slashRate > maxSlashRate) {
            return maxSlashRate;
        }
        return slashRate;
    }

    // Sets the slash rate for the given minipool
    function setSlashRate(address _minipoolAddress, uint256 _rate) external override onlyLatestNetworkContract {
        setUint(keccak256(abi.encodePacked("minipool.slash.rate", _minipoolAddress)), _rate);
    }
}
