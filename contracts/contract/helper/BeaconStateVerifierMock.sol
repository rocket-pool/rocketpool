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

    constructor(RocketStorageInterface _rocketStorageAddress, uint64[7] memory _forkSlots) {
        verifier = new BeaconStateVerifier(_rocketStorageAddress, 8192, _forkSlots, address(this));
    }

    function verifySlot(uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) override external view returns (VerifiedSlot memory result) {
        if (!disabled) return verifier.verifySlot(_slotTimestamp, _proofVersion, _proofData);
        require(_proofVersion == 1, "Unsupported proof version");
        result.slot = abi.decode(_proofData, (SlotProofBundleV1)).slotProof.slot;
    }

    function verifyParticipation(uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) override external view returns (VerifiedParticipation memory result) {
        if (!disabled) return verifier.verifyParticipation(_slotTimestamp, _proofVersion, _proofData);
        require(_proofVersion == 1, "Unsupported proof version");
        ParticipationProofBundleV1 memory proof = abi.decode(_proofData, (ParticipationProofBundleV1));
        require(proof.validatorProof.validatorIndex == proof.participationProof.validatorIndex, "Incorrect validator index");
        result.validatorPubkeyHash = keccak256(proof.validatorProof.validator.pubkey);
        result.validatorIndex = proof.validatorProof.validatorIndex;
        result.slot = proof.slotProof.slot;
        result.participationSlot = proof.participationProof.participationSlot;
        result.participationFlags = uint8(proof.participationProof.participationFlagsChunk[result.validatorIndex % 32]);
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
        } else {
            revert("Unsupported proof version");
        }
        require(withdrawalProof.withdrawal.validatorIndex == validatorProof.validatorIndex, "Withdrawal validator not matching");
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
