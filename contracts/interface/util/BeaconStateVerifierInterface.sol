// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

struct Withdrawal {
    uint256 index;
    uint256 validatorIndex;
    bytes32 withdrawalCredentials;
    uint256 amountInGwei;
}

struct ValidatorProof {
    uint64 slot;
    uint256 validatorIndex;
    bytes pubkey;
    bytes32 withdrawalCredentials;
    bytes32[] witnesses;
}

interface BeaconStateVerifierInterface {
    function verifyValidator(ValidatorProof calldata _proof) external view returns(bool);
    function verifyExit(uint256 _validatorIndex, uint256 _withdrawableEpoch, uint64 _slot, bytes32[] calldata _proof) external view returns(bool);
    function verifyWithdrawal(uint256 _validatorIndex, uint64 _withdrawalSlot, uint256 _withdrawalNum, Withdrawal calldata _withdrawal, uint64 _slot, bytes32[] calldata _proof) external view returns(bool);
}
