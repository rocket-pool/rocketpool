// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

    struct Withdrawal {
        uint64 index;
        uint64 validatorIndex;
        bytes20 withdrawalCredentials;
        uint64 amountInGwei;
    }

    struct WithdrawalProof {
        uint64 withdrawalSlot;
        uint16 withdrawalNum;
        Withdrawal withdrawal;
        bytes32[] witnesses;
    }

    struct Validator {
        bytes pubkey;
        bytes32 withdrawalCredentials;
        uint64 effectiveBalance;
        bool slashed;
        uint64 activationEligibilityEpoch;
        uint64 activationEpoch;
        uint64 exitEpoch;
        uint64 withdrawableEpoch;
    }

    struct ValidatorProof {
        uint40 validatorIndex;
        Validator validator;
        bytes32[] witnesses;
    }

    struct SlotProof {
        uint64 slot;
        bytes32[] witnesses;
    }

    /// Canonical payload for validator proof version 1
    struct ValidatorProofBundleV1 {
        ValidatorProof validatorProof;
        SlotProof slotProof;
    }

    /// Canonical payload for final balance proof version 1 (pre-Gloas only)
    struct FinalBalanceProofBundleV1 {
        WithdrawalProof withdrawalProof;
        ValidatorProof validatorProof;
        SlotProof slotProof;
    }

    /// Proof of BeaconState.next_withdrawal_index for the state preceding a withdrawal slot
    struct NextWithdrawalIndexProof {
        uint64 nextWithdrawalIndex;
        bytes32[] witnesses;
    }

    /// Canonical payload for final balance proof version 2 (post-Gloas)
    struct FinalBalanceProofBundleV2 {
        WithdrawalProof withdrawalProof;
        ValidatorProof validatorProof;
        SlotProof slotProof;
        NextWithdrawalIndexProof previousNextWithdrawalIndexProof;
    }

    /// Fork-independent result returned by a successfully verified validator proof bundle
    struct VerifiedValidator {
        uint40 validatorIndex;
        Validator validator;
        uint64 slot;
    }

    /// Fork-independent result returned by a successfully verified final balance proof bundle
    struct VerifiedFinalBalance {
        bytes32 validatorPubkeyHash;
        bytes32 withdrawalCredentials;
        uint64 amountInGwei;
        uint64 withdrawalEpoch;
        uint64 recentEpoch;
    }

    struct ParticipationProof {
        uint64 participationSlot;
        uint40 validatorIndex;
        bytes32 participationFlagsChunk;
        bytes32[] witnesses;
    }

    struct SlotProofBundleV1 {
        SlotProof slotProof;
    }

    struct ParticipationProofBundleV1 {
        ValidatorProof validatorProof;
        ParticipationProof participationProof;
        SlotProof slotProof;
    }

    struct VerifiedSlot {
        uint64 slot;
    }

    struct VerifiedParticipation {
        bytes32 validatorPubkeyHash;
        uint40 validatorIndex;
        uint64 slot;
        uint64 participationSlot;
        uint8 participationFlags;
    }

interface BeaconStateVerifierInterface {
    function verifySlot(uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external view returns (VerifiedSlot memory);
    function verifyParticipation(uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external view returns (VerifiedParticipation memory);
    function verifyValidator(uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external view returns (VerifiedValidator memory);
    function verifyFinalBalance(uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external view returns (VerifiedFinalBalance memory);
}
