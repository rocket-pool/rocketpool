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
        Status status;
        bool express;
        uint32 assignmentTime;
        uint32 totalScrubVotes;
        bytes withdrawalCredential;
        bytes pubKey;
    }

    // Extra data temporarily stored for prestake operation
    struct PrestakeData {
        bytes _signature;
        bytes32 _depositDataRoot;
    }

    //
    // Delegate state
    //

    // Used to prevent direct calls to the delegate contract
    bool internal storageState;

    // Used to store the expiry block of this delegate
    uint256 internal expiry;

    //
    // Proxy state
    //

    // The current delegate contract address
    address internal rocketMegapoolDelegate;

    // Whether this proxy always uses the latest delegate
    bool internal useLatestDelegate;

    //
    // Megapool state
    //

    address internal nodeAddress;

    uint256 internal numValidators;
    uint256 internal assignedValue;
    uint256 internal debt;
    uint256 internal stakedRPL;
    uint256 internal unstakedRPL;
    uint256 internal lastUnstakeRequest;

    mapping(uint32 => ValidatorInfo) internal validators;
    mapping(uint32 => PrestakeData) internal prestakeData;
}
