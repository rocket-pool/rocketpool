// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

    struct Withdrawal {
        uint64 index;
        uint64 validatorIndex;
        bytes20 withdrawalCredentials;
        uint64 amountInGwei;
    }

    struct WithdrawalProof {
        uint64 slot;
        uint64 withdrawalSlot;
        uint64 withdrawalNum;
        Withdrawal withdrawal;
        bytes32[] witnesses;
    }

    struct Validator {
        bytes pubkey;
        bytes32 withdrawalCredentials;
        uint256 effectiveBalance;
        bool slashed;
        uint64 activationEligibilityEpoch;
        uint64 activationEpoch;
        uint64 exitEpoch;
        uint64 withdrawableEpoch;
    }

    struct ValidatorProof {
        uint64 slot;
        uint64 validatorIndex;
        Validator validator;
        bytes32[] witnesses;
    }

interface BeaconStateVerifierInterface {
    function verifyValidator(ValidatorProof calldata _proof) external view returns (bool);
    function verifyWithdrawal(WithdrawalProof calldata _proof) external view returns (bool);
}
