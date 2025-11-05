// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketMegapoolManagerInterface} from "../../interface/megapool/RocketMegapoolManagerInterface.sol";
import {BeaconStateVerifierInterface, ValidatorProof, Withdrawal, WithdrawalProof, SlotProof} from "../../interface/util/BeaconStateVerifierInterface.sol";

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
        version = 1;
        // Precompute static storage keys
        challengerKey = keccak256("last.trusted.node.megapool.challenger");
        setCountKey = keccak256("megapool.validator.set.count");
    }

    /// @notice Returns the total number validators across all megapools
    function getValidatorCount() override external view returns (uint256) {
        return getUint(setCountKey);
    }

    /// @notice Get a megapool address by validator pubkey
    /// @param _pubkey The pubkey to query
    function getMegapoolByPubkey(bytes calldata _pubkey) override external view returns (address) {
        return getAddress(keccak256(abi.encodePacked("validator.megapool", _pubkey)));
    }

    /// @notice Adds a validator record to the global megapool validator set
    /// @param _megapoolAddress Address of the megapool which manages this validator
    /// @param _validatorId Internal validator ID of the new validator
    function addValidator(address _megapoolAddress, uint32 _validatorId, bytes calldata _pubkey) override external onlyLatestContract("rocketMegapoolManager", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) {
        uint256 index = getUint(setCountKey);
        setUint(setCountKey, index + 1);
        uint256 encoded = (uint256(uint160(_megapoolAddress)) << 96) | uint32(_validatorId);
        setUint(keccak256(abi.encodePacked("megapool.validator.set", index)), encoded);
        // Add pubkey => megapool mapping and ensure uniqueness
        bytes32 key = keccak256(abi.encodePacked("validator.megapool", _pubkey));
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

    /// @notice Verifies a validator state proof then calls stake on the megapool
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _validatorProof State proof of the validator
    /// @param _slotProof State proof of the slot
    function stake(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) override external onlyRegisteredMegapool(address(_megapool)) {
        // Require a recent proof
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Verify state proofs
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_slotTimestamp, _slotProof.slot, _validatorProof), "Invalid validator proof");
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
        bytes32 withdrawalCredentials = _megapool.getWithdrawalCredentials();
        // Verify validator state
        require(_validatorProof.validator.withdrawalCredentials == withdrawalCredentials, "Invalid withdrawal credentials");
        require(_validatorProof.validator.withdrawableEpoch == farFutureEpoch, "Validator is withdrawing");
        require(_validatorProof.validator.exitEpoch == farFutureEpoch, "Validator is exiting");
        require(_validatorProof.validator.effectiveBalance < activationBalanceInGwei, "Invalid validator balance");
        require(_validatorProof.validator.activationEligibilityEpoch == farFutureEpoch, "Validator is activating");
        require(_validatorProof.validator.activationEpoch == farFutureEpoch, "Validator is activated");
        require(!_validatorProof.validator.slashed, "Validator is slashed");
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(_validatorProof.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
        // Perform the stake
        _megapool.stake(_validatorId);
    }

    /// @notice Immediately dissolves a validator if any validator state is non-compliant
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _validatorProof State proof of the validator
    /// @param _slotProof State proof of the slot
    function dissolve(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) override external onlyRegisteredMegapool(address(_megapool)) {
        // Require a recent proof
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Verify state proofs
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_slotTimestamp, _slotProof.slot, _validatorProof), "Invalid validator proof");
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
        // Verify compliant validator state
        bytes32 withdrawalCredentials = _megapool.getWithdrawalCredentials();
        if(
            _validatorProof.validator.withdrawalCredentials == withdrawalCredentials &&
            _validatorProof.validator.withdrawableEpoch == farFutureEpoch &&
            _validatorProof.validator.exitEpoch == farFutureEpoch &&
            _validatorProof.validator.effectiveBalance < activationBalanceInGwei &&
            _validatorProof.validator.activationEligibilityEpoch == farFutureEpoch &&
            _validatorProof.validator.activationEpoch == farFutureEpoch &&
            _validatorProof.validator.slashed == false
        ) {
            revert("Validator is compliant");
        }
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(_validatorProof.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
        // Dissolve the validator
        _megapool.dissolveValidator(_validatorId);
    }

    /// @notice Verifies a validator state proof then notifies megapool about the exit
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _validatorProof State proof of the validator
    /// @param _slotProof State proof of the slot
    function notifyExit(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) override external onlyRegisteredMegapool(address(_megapool)) {
        // Require a recent proof
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Verify state proofs
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_slotTimestamp, _slotProof.slot, _validatorProof), "Invalid validator proof");
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
        // Verify correct withdrawable_epoch
        require(_validatorProof.validator.withdrawableEpoch < farFutureEpoch, "Validator not exiting");
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(_validatorProof.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
        // Compute the epoch of the supplied proof
        uint64 recentEpoch = _slotProof.slot / slotsPerEpoch;
        // Notify megapool
        _megapool.notifyExit(_validatorId, _validatorProof.validator.withdrawableEpoch, recentEpoch);
    }

    /// @notice Verifies a validator state proof then notifies megapool that this validator was not exiting at given slot
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _validatorProof State proof of the validator
    /// @param _slotProof State proof of the slot
    function notifyNotExit(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) override external onlyRegisteredMegapool(address(_megapool)) {
        // Require a recent proof
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Verify state proofs
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_slotTimestamp, _slotProof.slot, _validatorProof), "Invalid validator proof");
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
        // Verify correct withdrawable_epoch
        require(_validatorProof.validator.withdrawableEpoch == farFutureEpoch, "Validator already exiting");
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(_validatorProof.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
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

    /// @notice Verifies a withdrawal state proof then notifies megapool of the final balance
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _withdrawalProof State proof of the withdrawal
    /// @param _validatorProof State proof of the validator at the same slot as the withdrawal
    /// @param _slotProof State proof of the slot
    function notifyFinalBalance(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, WithdrawalProof calldata _withdrawalProof, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) override external onlyRegisteredMegapool(address(_megapool)) {
        // Require a recent proof
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Check that the withdrawal occurred on or after `withdrawable_epoch`
        uint64 withdrawalEpoch = _withdrawalProof.withdrawalSlot / slotsPerEpoch;
        require(withdrawalEpoch >= _validatorProof.validator.withdrawableEpoch, "Not full withdrawal");
        // Verify state proofs
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_slotTimestamp, _slotProof.slot, _validatorProof), "Invalid validator proof");
        require(beaconStateVerifier.verifyWithdrawal(_slotTimestamp, _slotProof.slot, _withdrawalProof), "Invalid withdrawal proof");
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
        // Verify withdrawal validator index matches validator index
        require(_withdrawalProof.withdrawal.validatorIndex == _validatorProof.validatorIndex, "Withdrawal validator not matching");
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(_validatorProof.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
        // Compute the epoch of the supplied proof
        uint64 recentEpoch = _slotProof.slot / slotsPerEpoch;
        // Notify megapool
        _megapool.notifyFinalBalance(_validatorId, _withdrawalProof.withdrawal.amountInGwei, msg.sender, withdrawalEpoch, recentEpoch);
    }
}
