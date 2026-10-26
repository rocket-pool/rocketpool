const { AbiCoder } = require('ethers');
const validatorProofType = 'tuple(uint40 validatorIndex,tuple(bytes pubkey,bytes32 withdrawalCredentials,uint64 effectiveBalance,bool slashed,uint64 activationEligibilityEpoch,uint64 activationEpoch,uint64 exitEpoch,uint64 withdrawableEpoch) validator,bytes32[] witnesses)';
const slotProofType = 'tuple(uint64 slot,bytes32[] witnesses)';
const withdrawalProofType = 'tuple(uint64 withdrawalSlot,uint16 withdrawalNum,tuple(uint64 index,uint64 validatorIndex,bytes20 withdrawalCredentials,uint64 amountInGwei) withdrawal,bytes32[] witnesses)';
const participationProofType = 'tuple(uint64 participationSlot,uint40 validatorIndex,bytes32 participationFlagsChunk,bytes32[] witnesses)';
const nextWithdrawalIndexProofType = 'tuple(uint64 nextWithdrawalIndex,bytes32[] witnesses)';
const encode = (types, values) => AbiCoder.defaultAbiCoder().encode([`tuple(${types.join(',')})`], [values]);
exports.encodeValidatorProofV1 = (validator, slot) => encode([validatorProofType, slotProofType], [validator, slot]);
exports.encodeSlotProofV1 = slot => encode([slotProofType], [slot]);
exports.encodeParticipationProofV1 = (validator, participation, slot) => encode([validatorProofType, participationProofType, slotProofType], [validator, participation, slot]);
exports.encodeFinalBalanceProofV1 = (withdrawal, validator, slot) => encode([withdrawalProofType, validatorProofType, slotProofType], [withdrawal, validator, slot]);
exports.encodeFinalBalanceProofV2 = (withdrawal, validator, slot, previous) => encode(
    [withdrawalProofType, validatorProofType, slotProofType, nextWithdrawalIndexProofType],
    [withdrawal, validator, slot, previous],
);
