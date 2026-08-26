// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../../interface/RocketStorageInterface.sol";
import "../../interface/util/BeaconStateVerifierInterface.sol";
import {BeaconStateVerifier} from "../util/BeaconStateVerifier.sol";

/// @dev NOT USED IN PRODUCTION - This contract only exists to bypass state proofs during tests
contract BeaconStateVerifierMock is BeaconStateVerifierInterface {
    bool private disabled = false;

    BeaconStateVerifierInterface private immutable verifier;

    mapping(uint256 => bytes32) internal beaconRoots;

    constructor(RocketStorageInterface _rocketStorageAddress) {
        // Set to mainnet values for use in unit tests with real proofs
        uint64[7] memory forkSlots;
        forkSlots[0] = 74240 * 32;
        forkSlots[1] = 144896 * 32;
        forkSlots[2] = 194048 * 32;
        forkSlots[3] = 269568 * 32;
        forkSlots[4] = 364032 * 32;
        forkSlots[5] = 411392 * 32;
        forkSlots[6] = 14000000;
        verifier = new BeaconStateVerifier(_rocketStorageAddress, 8192, forkSlots, address(this));
    }

    function setDisabled(bool _disabled) external {
        disabled = _disabled;
    }

    function verifyValidator(uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) override external view returns (VerifiedValidator memory result) {
        if (!disabled) {
            return verifier.verifyValidator(_slotTimestamp, _proofVersion, _proofData);
        }
        require(_proofVersion == 1, "Unsupported proof version");
        ValidatorProofBundleV1 memory proof = abi.decode(_proofData, (ValidatorProofBundleV1));
        result.validatorIndex = proof.validatorProof.validatorIndex;
        result.validator = proof.validatorProof.validator;
        result.slot = proof.slotProof.slot;
    }

    function verifyFinalBalance(uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) override external view returns (VerifiedFinalBalance memory result) {
        if (!disabled) {
            return verifier.verifyFinalBalance(_slotTimestamp, _proofVersion, _proofData);
        }
        WithdrawalProof memory withdrawalProof;
        ValidatorProof memory validatorProof;
        SlotProof memory slotProof;
        bytes32 validatorBalanceChunk;
        if (_proofVersion == 1) {
            FinalBalanceProofBundleV1 memory proof = abi.decode(_proofData, (FinalBalanceProofBundleV1));
            withdrawalProof = proof.withdrawalProof;
            validatorProof = proof.validatorProof;
            slotProof = proof.slotProof;
        } else if (_proofVersion == 2) {
            FinalBalanceProofBundleV2 memory proof = abi.decode(_proofData, (FinalBalanceProofBundleV2));
            require(
                proof.withdrawalProof.withdrawal.index ==
                    proof.previousNextWithdrawalIndexProof.nextWithdrawalIndex + uint64(proof.withdrawalProof.withdrawalNum),
                "Stale withdrawal proof"
            );
            withdrawalProof = proof.withdrawalProof;
            validatorProof = proof.validatorProof;
            slotProof = proof.slotProof;
            validatorBalanceChunk = proof.validatorBalanceProof.balanceChunk;
        } else {
            revert("Unsupported proof version");
        }
        require(withdrawalProof.withdrawal.validatorIndex == validatorProof.validatorIndex, "Withdrawal validator not matching");
        if (_proofVersion == 2) {
            uint256 shift = (3 - uint256(validatorProof.validatorIndex % 4)) * 64;
            require(uint64(uint256(validatorBalanceChunk) >> shift) == 0, "Validator balance not zero");
        }
        uint64 withdrawalEpoch = withdrawalProof.withdrawalSlot / 32;
        require(withdrawalEpoch >= validatorProof.validator.withdrawableEpoch, "Not full withdrawal");
        result.validatorPubkeyHash = keccak256(validatorProof.validator.pubkey);
        result.withdrawalCredentials = validatorProof.validator.withdrawalCredentials;
        result.amountInGwei = withdrawalProof.withdrawal.amountInGwei;
        result.withdrawalEpoch = withdrawalEpoch;
        result.recentEpoch = slotProof.slot / 32;
    }

    function setBlockRoot(uint256 _timestamp, bytes32 _root) external {
        beaconRoots[_timestamp] = _root;
    }

    fallback(bytes calldata _input) external returns (bytes memory) {
        uint256 timestamp = abi.decode(_input, (uint256));
        if (beaconRoots[timestamp] != 0) {
            return abi.encode(beaconRoots[timestamp]);
        }
        revert();
    }

}
