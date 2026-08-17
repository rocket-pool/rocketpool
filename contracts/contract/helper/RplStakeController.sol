// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNodeStakingInterface} from "../../interface/node/RocketNodeStakingInterface.sol";

/// @dev Test-only registered network caller for RocketNodeStaking primitives.
contract RplStakeController is RocketBase {
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {}

    function lock(address _nodeAddress, uint256 _amount) external {
        RocketNodeStakingInterface(getContractAddress("rocketNodeStaking")).lockRPL(_nodeAddress, _amount);
    }

    function unlock(address _nodeAddress, uint256 _amount) external {
        RocketNodeStakingInterface(getContractAddress("rocketNodeStaking")).unlockRPL(_nodeAddress, _amount);
    }

    function transfer(address _from, address _to, uint256 _amount) external {
        RocketNodeStakingInterface(getContractAddress("rocketNodeStaking")).transferRPL(_from, _to, _amount);
    }

    function burn(address _from, uint256 _amount) external {
        RocketNodeStakingInterface(getContractAddress("rocketNodeStaking")).burnRPL(_from, _amount);
    }
}
