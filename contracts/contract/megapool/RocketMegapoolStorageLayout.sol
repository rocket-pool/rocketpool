// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../../interface/RocketStorageInterface.sol";

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
        bytes pubKey;   // Pubkey of this validator

        uint32 lastAssignmentTime;  // Timestamp of when the last fund assignment took place
        uint32 lastRequestedValue;  // Value in milliether last requested
        uint32 lastRequestedBond;   // Value in milliether of the bond supplied for last request for funds

        bool staked;        // Whether the validator has staked the minimum required to begin validating (32 ETH)
        bool exited;        // Whether the validator has exited the beacon chain
        bool inQueue;       // Whether the validator is currently awaiting funds from the deposit pool
        bool inPrestake;    // Whether the validator is currently awaiting the stake operation
        bool expressUsed;   // Whether the last request for funds consumed an express ticket
        bool dissolved;     // Whether the validator failed to prestake their initial deposit in time
    }

    // Extra data temporarily stored for prestake operation
    struct PrestakeData {
        bytes _signature;
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

    address internal nodeAddress;     // Megapool owner
    uint32 internal numValidators;    // Number of individual validators handled by this megapool

    uint256 internal assignedValue;   // ETH assigned from DP pending prestake/stake
    uint256 internal refundValue;     // ETH refunded to the owner after a dissolution
    uint256 internal nodeRewards;     // Unclaimed ETH rewards for the owner

    uint256 internal nodeBond;        // Total value of bond supplied by node operator
    uint256 internal nodeCapital;     // Value of capital on the beacon chain supplied by the owner
    uint256 internal userCapital;     // Value of capital on the beacon chain supplied by the DP

    uint256 internal debt;            // Amount the owner owes the DP

    uint256 internal lastDistributionBlock; // The block of the last time a distribution of rewards was executed

    mapping(uint32 => ValidatorInfo) internal validators;
    mapping(uint32 => PrestakeData) internal prestakeData;

    // TODO: Move this to rocketNodeStaking
    uint256 internal stakedRPL;
    uint256 internal unstakedRPL;
    uint256 internal lastUnstakeRequest;

}
