// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";

// ******************************************************
// Note: This contract MUST only be appended to. All
// deployed megapool contracts must maintain a
// consistent storage layout with RocketMegapoolDelegate.
// ******************************************************

/// @dev The RocketMegapool contract storage layout, shared by RocketMegapoolDelegate and RocketMegapoolBase
abstract contract RocketMegapoolStorageLayout {
    // Status of individual validators
    enum Status {
        InQueue,
        PreStaked,
        Staking,
        Exited,
        Dissolved
    }

    // Information about individual validators
    struct ValidatorInfo {
        uint32 lastAssignmentTime;  // Timestamp of when the last fund assignment took place
        uint32 lastRequestedValue;  // Value in milliether last requested
        uint32 lastRequestedBond;   // Value in milliether of the bond supplied for last request for funds
        uint32 depositValue;        // Total amount deposited to beaconchain in gwei

        bool staked;        // Whether the validator has staked the minimum required to begin validating (32 ETH)
        bool exited;        // Whether the validator has exited the beacon chain
        bool inQueue;       // Whether the validator is currently awaiting funds from the deposit pool
        bool inPrestake;    // Whether the validator is currently awaiting the stake operation
        bool expressUsed;   // Whether the last request for funds consumed an express ticket
        bool dissolved;     // Whether the validator failed to prestake their initial deposit in time
        bool exiting;       // Whether the validator is queued to exit on the beaconchain
        bool locked;        // Whether the validator has been locked by the oDAO for not exiting

        uint64 validatorIndex;      // Index of the validator on the beaconchain
        uint64 exitBalance;         // Final balance of the validator at withdrawable_epoch in gwei (amount returned to EL)
        uint64 withdrawableEpoch;   // The epoch this validator is withdrawable
        uint64 lockedSlot;          // The slot this validator was challenged about its exit status
    }

    //
    // Delegate state
    //

    bool internal storageState;           // Used to prevent direct calls to the delegate contract
    uint256 internal expirationBlock;     // Used to store the expiry block of this delegate (0 meaning not expiring)

    //
    // Proxy state
    //

    address internal rocketMegapoolDelegate;  // The current delegate contract address
    bool internal useLatestDelegate;          // Whether this proxy always uses the latest delegate

    //
    // Megapool state
    //

    address internal nodeAddress;             // Megapool owner
    uint32 internal numValidators;            // Number of individual validators handled by this megapool
    uint32 internal numInactiveValidators;    // Number of validators that are no longer contributing to bond requirement

    uint256 internal assignedValue;   // ETH assigned from DP pending prestake/stake
    uint256 internal refundValue;     // ETH refunded to the owner after a dissolution
    uint256 internal nodeRewards;     // Unclaimed ETH rewards for the owner

    uint256 internal nodeBond;        // Total value of bond supplied by node operator
    uint256 internal userCapital;     // Value of capital on the beacon chain supplied by the DP

    uint256 internal debt;            // Amount the owner owes the DP

    uint256 internal lastDistributionBlock; // The block of the last time a distribution of rewards was executed

    mapping(uint32 => ValidatorInfo) internal validators;
    mapping(uint32 => bytes) internal prestakeSignatures;
    mapping(uint32 => bytes) internal pubkeys;

    uint32 internal numLockedValidators;        // Number of validators currently locked
    uint32 internal numExitingValidators;       // Number of validators currently exiting
    uint64 internal soonestWithdrawableEpoch;   // The soonest epoch which a validator will become withdrawable

    mapping(uint256 => uint256) internal penalties;

    uint256 internal __version1Boundary;        // Unused full slot width boundary
}
