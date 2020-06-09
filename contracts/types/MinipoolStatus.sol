pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

enum MinipoolStatus {
    Initialized,    // The minipool has been initialized and is awaiting a deposit of user ETH
    Prelaunch,      // The minipool has enough ETH to begin staking and is awaiting launch by the node operator
    Staking,        // The minipool is currently staking
    Exited,         // The minipool has exited the beacon chain and is waiting to become withdrawable
    Withdrawable    // The minipool has become withdrawable on the beacon chain and can be withdrawn from by the node operator
}
