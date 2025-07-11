// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketMegapoolManagerInterface} from "../../interface/megapool/RocketMegapoolManagerInterface.sol";
import {BeaconStateVerifierInterface, ValidatorProof, Withdrawal, WithdrawalProof} from "../../interface/util/BeaconStateVerifierInterface.sol";

/// @notice Handles protocol-level megapool functionality
contract RocketMegapoolManager is RocketBase, RocketMegapoolManagerInterface {
    // Immutables
    bytes32 immutable internal challengerKey;
    bytes32 immutable internal setCountKey;

    // Constants
    uint256 constant internal farFutureEpoch = 2 ** 64 - 1;

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

    /// @notice Adds a validator record to the global megapool validator set
    /// @param _megapoolAddress Address of the megapool which manages this validator
    /// @param _validatorId Internal validator ID of the new validator
    function addValidator(address _megapoolAddress, uint32 _validatorId) override external onlyLatestContract("rocketMegapoolManager", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) {
        uint256 index = getUint(setCountKey);
        setUint(setCountKey, index + 1);
        uint256 encoded = (uint256(uint160(_megapoolAddress)) << 96) | uint32(_validatorId);
        setUint(keccak256(abi.encodePacked("megapool.validator.set", index)), encoded);
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
    /// @param _proof State proof of the validator
    function stake(RocketMegapoolInterface _megapool, uint32 _validatorId, ValidatorProof calldata _proof) override external {
        // Verify state proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_proof), "Invalid proof");
        // Verify matching withdrawal credentials
        bytes32 withdrawalCredentials = _megapool.getWithdrawalCredentials();
        require(_proof.validator.withdrawalCredentials == withdrawalCredentials, "Invalid withdrawal credentials");
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(_proof.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
        // Perform the stake
        _megapool.stake(_validatorId, _proof.validatorIndex);
    }

    /// @notice Immediately dissolves a validator if withdrawal credentials are incorrect
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _proof State proof of the validator
    function dissolve(RocketMegapoolInterface _megapool, uint32 _validatorId, ValidatorProof calldata _proof) override external {
        // Verify state proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_proof), "Invalid proof");
        // Verify matching withdrawal credentials
        bytes32 withdrawalCredentials = _megapool.getWithdrawalCredentials();
        require(_proof.validator.withdrawalCredentials != withdrawalCredentials, "Valid withdrawal credentials");
        // Verify matching pubkey
        bytes memory pubkey = _megapool.getValidatorPubkey(_validatorId);
        require(keccak256(_proof.validator.pubkey) == keccak256(pubkey), "Pubkey does not match");
        // Dissolve the validator
        _megapool.dissolveValidator(_validatorId);
    }

    /// @notice Verifies a validator state proof then notifies megapool about the exit
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _proof State proof of the validator
    function notifyExit(RocketMegapoolInterface _megapool, uint32 _validatorId, ValidatorProof calldata _proof) override external {
        // Verify state proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_proof), "Invalid proof");
        // Verify correct withdrawable_epoch
        require(_proof.validator.withdrawableEpoch < farFutureEpoch, "Validator not exiting");
        // Verify matching validator index
        RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo = _megapool.getValidatorInfo(_validatorId);
        require(_proof.validatorIndex == validatorInfo.validatorIndex, "Invalid proof");
        // Notify megapool
        _megapool.notifyExit(_validatorId, _proof.validator.withdrawableEpoch);
    }

    /// @notice Verifies a validator state proof then notifies megapool that this validator was not exiting at given slot
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _proof State proof of the validator
    function notifyNotExit(RocketMegapoolInterface _megapool, uint32 _validatorId, ValidatorProof calldata _proof) override external {
        // Verify state proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_proof), "Invalid proof");
        // Verify correct withdrawable_epoch
        require(_proof.validator.withdrawableEpoch == farFutureEpoch, "Validator is exiting");
        // Verify matching validator index
        RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo = _megapool.getValidatorInfo(_validatorId);
        require(_proof.validatorIndex == validatorInfo.validatorIndex, "Invalid proof");
        // Notify the megapool that the specified validator was not exiting at the proven slot
        _megapool.notifyNotExit(_validatorId, _proof.slot);
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
                _challenges[i].megapool.challengeExit(_challenges[i].validatorIds[j]);
                totalChallenges += 1;
            }
        }
        // Only allow up to 50 total challenges at a time
        require(totalChallenges < 50, "Too many challenges");
    }

    /// @notice Verifies a withdrawal state proof then notifies megapool of the final balance
    /// @param _megapool Address of the megapool which the validator belongs to
    /// @param _validatorId Internal ID of the validator within the megapool
    /// @param _proof State proof of the withdrawal
    function notifyFinalBalance(RocketMegapoolInterface _megapool, uint32 _validatorId, WithdrawalProof calldata _proof) override external {
        // Verify state proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyWithdrawal(_proof), "Invalid proof");
        // Verify matching validator index
        RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo = _megapool.getValidatorInfo(_validatorId);
        require(_proof.withdrawal.validatorIndex == validatorInfo.validatorIndex, "Invalid proof");
        // Notify megapool
        _megapool.notifyFinalBalance(_validatorId, _proof.withdrawal.amountInGwei, msg.sender, _proof.withdrawalSlot);
    }
}
