// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";
import {RocketNetworkExitInterface} from "../../interface/network/RocketNetworkExitInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketMegapoolManagerInterface} from "../../interface/megapool/RocketMegapoolManagerInterface.sol";
import {RocketMegapoolFactoryInterface} from "../../interface/megapool/RocketMegapoolFactoryInterface.sol";
import {BLSDepositVerifierInterface} from "../../interface/util/BLSDepositVerifierInterface.sol";
import {
    BeaconStateVerifierInterface,
    VerifiedValidator,
    VerifiedFinalBalance,
    VerifiedPendingDeposit
} from "../../interface/util/BeaconStateVerifierInterface.sol";

/// @notice Handles protocol-level megapool functionality
contract RocketMegapoolManager is RocketBase, RocketMegapoolManagerInterface {
    // Immutables
    bytes32 immutable internal challengerKey;
    bytes32 immutable internal setCountKey;

    // Constants
    uint256 constant internal farFutureEpoch = 2 ** 64 - 1;
    uint256 constant internal activationBalanceInGwei = 32 ether / 1 gwei;
    uint64 constant internal prestakeValueInGwei = uint64(1 ether / 1 gwei);
    uint64 constant internal slotsPerEpoch = 32;
    uint256 constant internal slotRecencyThreshold = 1 hours;

    event InvalidSignatureChallenged(address indexed megapool, uint32 indexed validatorId, address indexed challenger);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 3;
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

    /// @notice Returns prestake watcher data for the given global megapool validator index
    /// @dev Legacy delegates expose no retained signature or challenge deadline, these return empty and zero
    /// @param _index The index of the validator to query
    function getValidatorPrestakeInfo(uint256 _index) override external view returns (bytes memory pubkey, RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo, address megapool, uint32 validatorId, bytes memory signature, uint256 challengeDeadline) {
        require(_index < getUint(setCountKey), "Validator does not exist");
        // Retrieve and decode entry
        uint256 encoded = getUint(keccak256(abi.encodePacked("megapool.validator.set", _index)));
        megapool = address(uint160(encoded >> 96));
        validatorId = uint32(encoded);
        RocketMegapoolInterface rocketMegapool = RocketMegapoolInterface(megapool);
        if (rocketMegapool.version() >= 2) {
            (validatorInfo, pubkey, signature, challengeDeadline) = rocketMegapool.getValidatorPrestakeInfo(validatorId);
        } else {
            (validatorInfo, pubkey) = rocketMegapool.getValidatorInfoAndPubkey(validatorId);
            signature = new bytes(0);
        }
    }

    /// @notice Returns global indices of prestaked validators within a bounded slice of the validator set
    /// @param _offset First global index to inspect
    /// @param _limit Maximum number of entries to inspect
    /// @return indices Global indices currently in prestake
    /// @return nextIndex First index after the inspected slice, capped at the total validator count
    /// @return failedIndices Global indices whose state could not be read and should be retried separately
    function getPrestakedValidatorIndices(uint256 _offset, uint256 _limit) override external view returns (uint256[] memory indices, uint256 nextIndex, uint256[] memory failedIndices) {
        require(_limit > 0, "Limit must be positive");
        uint256 total = getUint(setCountKey);
        if (_offset >= total) {
            return (new uint256[](0), total, new uint256[](0));
        }
        // Clamp before adding to avoid overflow for large limits
        uint256 size = total - _offset;
        if (size > _limit) size = _limit;
        nextIndex = _offset + size;
        indices = new uint256[](size);
        failedIndices = new uint256[](size);
        uint256 matches;
        uint256 failures;
        for (uint256 i = _offset; i < nextIndex; ++i) {
            uint256 encoded = getUint(keccak256(abi.encodePacked("megapool.validator.set", i)));
            RocketMegapoolInterface megapool = RocketMegapoolInterface(address(uint160(encoded >> 96)));
            // An expired pinned delegate attempts a storage-writing upgrade during fallback
            // Avoid that exceptional halt in STATICCALL, which would consume the forwarded gas
            if (!megapool.getUseLatestDelegate() && megapool.getDelegateExpired()) {
                failedIndices[failures++] = i;
                continue;
            }
            try megapool.getValidatorInfo(uint32(encoded)) returns (RocketMegapoolStorageLayout.ValidatorInfo memory info) {
                if (info.inPrestake) indices[matches++] = i;
            } catch {
                failedIndices[failures++] = i;
            }
        }
        // Trim the preallocated arrays to the number of results
        assembly {
            mstore(indices, matches)
            mstore(failedIndices, failures)
        }
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

    /// @notice Dissolves a prestaked validator whose retained deposit signature is invalid
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    function challengeInvalidSignature(RocketMegapoolInterface _megapool, uint32 _validatorId)
        override external onlyLatestContract("rocketMegapoolManager", address(this))
        onlyRegisteredMegapool(address(_megapool))
    {
        _requireEligibleChallenger();
        require(_megapool.getValidatorInfo(_validatorId).inPrestake, "Validator not prestaked");
        // Retrieve signature from megapool
        bytes memory signature = _megapool.getValidatorPrestakeSignature(_validatorId);
        require(signature.length != 0, "Prestake signature not retained");
        // Verify stored signature
        BLSDepositVerifierInterface blsDepositVerifier = BLSDepositVerifierInterface(getContractAddress("blsDepositVerifier"));
        bool valid = blsDepositVerifier.verifyDepositSignature(
            _megapool.getValidatorPubkey(_validatorId), _megapool.getWithdrawalCredentials(), prestakeValueInGwei, signature
        );
        require(!valid, "Prestake signature is valid");
        _megapool.dissolveInvalidValidator(_validatorId, msg.sender);
        // Emit event
        emit InvalidSignatureChallenged(address(_megapool), _validatorId, msg.sender);
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
    ) override external onlyLatestContract("rocketMegapoolManager", address(this)) onlyRegisteredMegapool(address(_megapool)) {
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
        _dissolveInvalidValidator(_megapool, _validatorId);
    }

    /// @notice Dissolves a prestaked validator with a validly signed pending deposit to incorrect withdrawal credentials
    /// @param _proofData For version 1, `abi.encode(PendingDepositProofBundleV1)`
    function dissolvePendingDeposit(
        RocketMegapoolInterface _megapool,
        uint32 _validatorId,
        uint64 _slotTimestamp,
        uint256 _proofVersion,
        bytes calldata _proofData
    ) override external onlyLatestContract("rocketMegapoolManager", address(this)) onlyRegisteredMegapool(address(_megapool)) {
        _requireRecentProof(_slotTimestamp);
        require(_megapool.getValidatorInfo(_validatorId).inPrestake, "Validator not prestaked");
        VerifiedPendingDeposit memory verified = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier")).verifyPendingDeposit(_slotTimestamp, _proofVersion, _proofData);
        require(keccak256(verified.deposit.pubkey) == keccak256(_megapool.getValidatorPubkey(_validatorId)), "Pubkey does not match");
        require(verified.deposit.withdrawalCredentials != _megapool.getWithdrawalCredentials(), "Correct withdrawal credentials");
        // Queue membership alone is insufficient: anyone can submit a deposit with an invalid signature.
        require(BLSDepositVerifierInterface(getContractAddress("blsDepositVerifier")).verifyDepositSignature(
            verified.deposit.pubkey, verified.deposit.withdrawalCredentials, verified.deposit.amountInGwei, verified.deposit.signature
        ), "Invalid pending deposit signature");
        _dissolveInvalidValidator(_megapool, _validatorId);
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
        RocketNetworkExitInterface(getContractAddress("rocketNetworkExit")).notifyMegapoolExit(address(_megapool), _validatorId);
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
        RocketNetworkExitInterface(getContractAddress("rocketNetworkExit")).notifyMegapoolFinalBalance(address(_megapool), _validatorId);
    }

    /// @dev Rejects stale proof anchors for all proof entrypoints
    function _requireRecentProof(uint64 _slotTimestamp) internal view {
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
    }

    /// @dev Challenger credit uses the existing node credit pathway
    function _requireEligibleChallenger() internal view onlyRegisteredNode(msg.sender) {
        RocketMegapoolFactoryInterface factory = RocketMegapoolFactoryInterface(getContractAddress("rocketMegapoolFactory"));
        require(factory.getMegapoolDeployed(msg.sender), "Challenger megapool must be deployed");
    }

    /// @dev Apply the same challenger eligibility and legacy compatibility to each beacon proof route
    function _dissolveInvalidValidator(RocketMegapoolInterface _megapool, uint32 _validatorId) internal {
        if (_megapool.version() >= 2) {
            // Only reserved prestakes pay a reward, legacy proof submissions remain permissionless
            if (_megapool.getValidatorChallengeDeadline(_validatorId) != 0) {
                _requireEligibleChallenger();
            }
            _megapool.dissolveInvalidValidator(_validatorId, msg.sender);
        } else {
            _megapool.dissolveValidator(_validatorId);
        }
    }
}
