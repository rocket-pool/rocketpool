// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../../interface/RocketVaultInterface.sol";
import "../RocketBase.sol";
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
