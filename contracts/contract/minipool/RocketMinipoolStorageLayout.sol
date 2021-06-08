pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../interface/RocketStorageInterface.sol";
import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";

// The RocketMinipool contract storage layout, shared by RocketMinipoolDelegate

// ******************************************************
// Note: This contract MUST NOT BE UPDATED after launch.
// All deployed minipool contracts must maintain a
// Consistent storage layout with RocketMinipoolDelegate.
// ******************************************************

abstract contract RocketMinipoolStorageLayout {

	// Main Rocket Pool storage contract
    RocketStorageInterface internal rocketStorage = RocketStorageInterface(0);

    // Status
    MinipoolStatus internal status;
    uint256 internal statusBlock;

    // Deposit type
    MinipoolDeposit internal depositType;

    // Node details
    address internal nodeAddress;
    uint256 internal nodeFee;
    uint256 internal nodeDepositBalance;
    uint256 internal nodeRefundBalance;

    // User deposit details
    uint256 internal userDepositBalance;
    uint256 internal userDepositAssignedTime;

    // Staking details
    uint256 internal stakingStartBalance;
    uint256 internal stakingEndBalance;

    // Safety check
    bool internal initialised;
}
