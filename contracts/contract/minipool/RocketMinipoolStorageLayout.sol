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
    // Storage state enum
    enum StorageState {
        Undefined,
        Uninitialised,
        Initialised
    }

	// Main Rocket Pool storage contract
    RocketStorageInterface internal rocketStorage = RocketStorageInterface(0);

    // Status
    MinipoolStatus internal status;
    uint256 internal statusBlock;
    uint256 internal statusTime;
    uint256 internal withdrawalBlock;

    // Deposit type
    MinipoolDeposit internal depositType;

    // Node details
    address internal nodeAddress;
    uint256 internal nodeFee;
    uint256 internal nodeDepositBalance;
    bool internal nodeDepositAssigned;
    uint256 internal nodeRefundBalance;
    uint256 internal nodeSlashBalance;

    // User deposit details
    uint256 internal userDepositBalance;
    uint256 internal userDepositAssignedTime;

    // Upgrade options
    bool internal useLatestDelegate = false;
    address internal rocketMinipoolDelegate;
    address internal rocketMinipoolDelegatePrev;

    // Local copy of RETH address
    address internal rocketTokenRETH;

    // Local copy of penalty contract
    address internal rocketMinipoolPenalty;

    // Used to prevent direct access to delegate and prevent calling initialise more than once
    StorageState storageState = StorageState.Undefined;

    // Whether node operator has finalised the pool
    bool internal finalised;

    // Trusted member scrub votes
    mapping(address => bool) memberScrubVotes;
    uint256 totalScrubVotes;

    // Initialise non-owner distribute prep time
    uint256 internal prepareNonOwnerDistributeTime;
}
