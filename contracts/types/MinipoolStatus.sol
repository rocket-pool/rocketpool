pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

// Represents a minipool's status within the network

enum MinipoolStatus {
    Initialised,             // The minipool has been initialised and is awaiting a deposit of user ETH
    Prelaunch,               // The minipool has enough ETH to begin staking and is awaiting launch by the node operator
    Staking,                 // The minipool is currently staking
    RequestedWithdrawable,   // The node operator has requested withdrawable state; functionally equivalent to staking, except when arbing
    Withdrawable,            // The minipool has become withdrawable on the beacon chain and can be withdrawn from by the node operator
    Dissolved                // The minipool has been dissolved and its user deposited ETH has been returned to the deposit pool
}
