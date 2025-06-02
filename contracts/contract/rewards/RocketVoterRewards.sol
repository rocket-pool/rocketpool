// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketVaultInterface} from "../../interface/RocketVaultInterface.sol";
import {RocketVoterRewardsInterface} from "../../interface/rewards/RocketVoterRewardsInterface.sol";

/// @notice Holding contract for voter's share of ETH rewards until implementation details are resolved
contract RocketVoterRewards is RocketBase, RocketVoterRewardsInterface {

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    receive() payable external {
        // Transfer incoming ETH directly to the vault
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.depositEther{value: msg.value}();
    }
}
