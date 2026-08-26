// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketMegapoolManagerInterface} from "../../interface/megapool/RocketMegapoolManagerInterface.sol";
import {
    BeaconStateVerifierInterface,
    VerifiedValidator,
    VerifiedFinalBalance
} from "../../interface/util/BeaconStateVerifierInterface.sol";

/// @notice Handles protocol-level megapool functionality
contract RocketMegapoolManager is RocketBase, RocketMegapoolManagerInterface {
    // Immutables
    bytes32 immutable internal challengerKey;
    bytes32 immutable internal setCountKey;

    // Constants
    uint256 constant internal farFutureEpoch = 2 ** 64 - 1;
    uint256 constant internal activationBalanceInGwei = 32 ether / 1 gwei;
    uint64 constant internal slotsPerEpoch = 32;
    uint256 constant internal slotRecencyThreshold = 1 hours;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
        // Precompute static storage keys
        challengerKey = keccak256("last.trusted.node.megapool.challenger");
        setCountKey = keccak256("megapool.validator.set.count");
    }

    /// @notice Returns the total number validators across all megapools
    function getValidatorCount() override external view returns (uint256) {
        return getUint(setCountKey);
    }

    /// @notice Adds a validator record to the global megapool validator set
    /// @param _megapoolAddress Address of the megapool which manages this validator
    /// @param _validatorId Internal validator ID of the new validator
    function addValidator(
        address _megapoolAddress,
        uint32 _validatorId,
        bytes calldata _pubkey
    ) override external onlyLatestContract("rocketMegapoolManager", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) {
        uint256 index = getUint(setCountKey);
        setUint(setCountKey, index + 1);
        uint256 encoded = (uint256(uint160(_megapoolAddress)) << 96) | _validatorId;
        setUint(keccak256(abi.encodePacked("megapool.validator.set", index)), encoded);
        // Add pubkey => megapool mapping and ensure uniqueness
        bytes32 key = keccak256(abi.encodePacked("validator.megapool", _megapoolAddress, _pubkey));
        require(getAddress(key) == address(0x0), "Pubkey in use");
        setAddress(key, _megapoolAddress);
    }

    /// @notice Returns the last trusted member to execute a challenge
    function getLastChallenger() override external view returns (address) {
        return getAddress(challengerKey);
    }

    /// @notice Returns validator info for the given global megapool validator index
    /// @param _index The index of the validator to query
    function getValidatorInfo(uint256 _index) override external view returns (bytes memory pubkey, RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo, address megapool, uint32 validatorId) {
        // Retrieve and decode entry
        uint256 encoded = getUint(keccak256(abi.encodePacked("megapool.validator.set", _index)));
        megapool = address(uint160(encoded >> 96));
        validatorId = uint32(encoded);
        // Fetch and return info
        RocketMegapoolInterface rocketMegapool = RocketMegapoolInterface(megapool);
        (validatorInfo, pubkey) = rocketMegapool.getValidatorInfoAndPubkey(validatorId);
    }

    /// @notice Verifies a versioned validator proof then stakes the validator
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _proofVersion Version id of the proof
    /// @param _proofData For version 1, `abi.encode(ValidatorProofBundleV1)`
    function stake(
        RocketMegapoolInterface _megapool,
        uint32 _validatorId,
        uint64 _slotTimestamp,
        uint256 _proofVersion,
        bytes calldata _proofData
    ) override external onlyRegisteredMegapool(address(_megapool)) {
        _requireRecentProof(_slotTimestamp);
        VerifiedValidator memory verified = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier")).verifyValidator(_slotTimestamp, _proofVersion, _proofData);
        bytes32 withdrawalCredentials = _megapool.getWithdrawalCredentials();
        // Verify validator state
        require(verified.validator.withdrawalCredentials == withdrawalCredentials, "Invalid withdrawal credentials");
        require(verified.validator.withdrawableEpoch == farFutureEpoch, "Validator is withdrawing");
        require(verified.validator.exitEpoch == farFutureEpoch, "Validator is exiting");
        require(verified.validator.effectiveBalance < activationBalanceInGwei, "Invalid validator balance");
        require(verified.validator.activationEligibilityEpoch == farFutureEpoch, "Validator is activating");
        require(verified.validator.activationEpoch == farFutureEpoch, "Validator is activated");
        require(!verified.validator.slashed, "Validator is slashed");
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(verified.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
        // Perform the stake
        _megapool.stake(_validatorId);
    }

    /// @notice Verifies a versioned validator proof then dissolves a non-compliant validator
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _proofVersion Version id of the proof
    /// @param _proofData For version 1, `abi.encode(ValidatorProofBundleV1)`
    function dissolve(
        RocketMegapoolInterface _megapool,
        uint32 _validatorId,
        uint64 _slotTimestamp,
        uint256 _proofVersion,
        bytes calldata _proofData
    ) override external onlyRegisteredMegapool(address(_megapool)) {
        // Require a recent proof
        _requireRecentProof(_slotTimestamp);
        VerifiedValidator memory verified = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier")).verifyValidator(_slotTimestamp, _proofVersion, _proofData);
        // Verify compliant validator state
        bytes32 withdrawalCredentials = _megapool.getWithdrawalCredentials();
        if(
            verified.validator.withdrawalCredentials == withdrawalCredentials &&
            verified.validator.withdrawableEpoch == farFutureEpoch &&
            verified.validator.exitEpoch == farFutureEpoch &&
            verified.validator.effectiveBalance < activationBalanceInGwei &&
            verified.validator.activationEligibilityEpoch == farFutureEpoch &&
            verified.validator.activationEpoch == farFutureEpoch &&
            verified.validator.slashed == false
        ) {
            revert("Validator is compliant");
        }
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(verified.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
        // Dissolve the validator
        _megapool.dissolveValidator(_validatorId);
    }

    /// @notice Verifies a versioned validator proof then notifies the validator exit
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _proofVersion Version id of the proof
    /// @param _proofData For version 1, `abi.encode(ValidatorProofBundleV1)`
    function notifyExit(
        RocketMegapoolInterface _megapool,
        uint32 _validatorId,
        uint64 _slotTimestamp,
        uint256 _proofVersion,
        bytes calldata _proofData
    ) override external onlyRegisteredMegapool(address(_megapool)) {
        _requireRecentProof(_slotTimestamp);
        VerifiedValidator memory verified = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier")).verifyValidator(_slotTimestamp, _proofVersion, _proofData);
        // Verify correct withdrawable_epoch
        require(verified.validator.withdrawableEpoch < farFutureEpoch, "Validator not exiting");
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(verified.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
        // Verify withdrawalCredentials
        bytes32 withdrawalCredentials = _megapool.getWithdrawalCredentials();
        require(verified.validator.withdrawalCredentials == withdrawalCredentials, "Invalid withdrawal credentials");
        // Compute the epoch of the supplied proof
        uint64 recentEpoch = verified.slot / slotsPerEpoch;
        // Notify megapool
        _megapool.notifyExit(_validatorId, verified.validator.withdrawableEpoch, recentEpoch);
    }

    /// @notice Verifies a versioned validator proof then notifies that the validator is not exiting
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _proofVersion Version id of the proof
    /// @param _proofData For version 1, `abi.encode(ValidatorProofBundleV1)`
    function notifyNotExit(
        RocketMegapoolInterface _megapool,
        uint32 _validatorId,
        uint64 _slotTimestamp,
        uint256 _proofVersion,
        bytes calldata _proofData
    ) override external onlyRegisteredMegapool(address(_megapool)) {
        _requireRecentProof(_slotTimestamp);
        VerifiedValidator memory verified = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier")).verifyValidator(_slotTimestamp, _proofVersion, _proofData);
        // Verify correct withdrawable_epoch
        require(verified.validator.withdrawableEpoch == farFutureEpoch, "Validator already exiting");
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(verified.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
        // Notify the megapool that the specified validator was not exiting at the proven slot
        _megapool.notifyNotExit(_validatorId, _slotTimestamp);
    }

    /// @notice Asserts that one or more megapool validators are exiting but a proof has not been supplied by the node operator
    /// @param _challenges List of challenges to submit
    /// @dev Only a trusted node can submit challenges
    function challengeExit(ExitChallenge[] calldata _challenges) override external onlyTrustedNode(msg.sender) {
        // Check if this member was the previous one to challenge
        address lastSubmitter = getAddress(challengerKey);
        require(msg.sender != lastSubmitter, "Member was last to challenge");
        setAddress(challengerKey, msg.sender);
        // Deliver challenges
        uint256 totalChallenges = 0;
        for (uint256 i = 0; i < _challenges.length; ++i) {
            for (uint256 j = 0; j < _challenges[i].validatorIds.length; ++j) {
                require(getBool(keccak256(abi.encodePacked("megapool.exists", address(_challenges[i].megapool)))), "Invalid megapool");
                _challenges[i].megapool.challengeExit(_challenges[i].validatorIds[j]);
                totalChallenges += 1;
            }
        }
        // Only allow up to 50 total challenges at a time
        require(totalChallenges <= 50, "Too many challenges");
    }

    /// @notice Verifies a versioned proof then notifies a megapool of a validator's final balance
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _proofVersion Version id of the proof
    /// @param _proofData Version 1 is `abi.encode(FinalBalanceProofBundleV1)`; version 2 is `abi.encode(FinalBalanceProofBundleV2)`
    function notifyFinalBalance(
        RocketMegapoolInterface _megapool,
        uint32 _validatorId,
        uint64 _slotTimestamp,
        uint256 _proofVersion,
        bytes calldata _proofData
    ) override external onlyRegisteredMegapool(address(_megapool)) {
        _requireRecentProof(_slotTimestamp);
        VerifiedFinalBalance memory verified = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier")).verifyFinalBalance(_slotTimestamp, _proofVersion, _proofData);
        require(verified.withdrawalCredentials == _megapool.getWithdrawalCredentials(), "Invalid withdrawal credentials");
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(verified.validatorPubkeyHash == keccak256(pubkey), "Pubkey does not match");
        _megapool.notifyFinalBalance(_validatorId, verified.amountInGwei, msg.sender, verified.withdrawalEpoch, verified.recentEpoch);
    }

    /// @dev Rejects stale proof anchors for all proof entrypoints
    function _requireRecentProof(uint64 _slotTimestamp) internal view {
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
    }
}
