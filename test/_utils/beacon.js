const ssz = require('@chainsafe/ssz');
const types = require('@chainsafe/lodestar-types/lib/ssz/presets/mainnet').types;
const ethers = require('hardhat').ethers;

const withdrawalProofType = 'tuple(uint64 withdrawalSlot,uint16 withdrawalNum,tuple(uint64 index,uint64 validatorIndex,bytes20 withdrawalCredentials,uint64 amountInGwei) withdrawal,bytes32[] witnesses)';
const validatorProofType = 'tuple(uint40 validatorIndex,tuple(bytes pubkey,bytes32 withdrawalCredentials,uint64 effectiveBalance,bool slashed,uint64 activationEligibilityEpoch,uint64 activationEpoch,uint64 exitEpoch,uint64 withdrawableEpoch) validator,bytes32[] witnesses)';
const slotProofType = 'tuple(uint64 slot,bytes32[] witnesses)';
const nextWithdrawalIndexProofType = 'tuple(uint64 nextWithdrawalIndex,bytes32[] witnesses)';
const validatorBalanceProofType = 'tuple(bytes32 balanceChunk,bytes32[] witnesses)';

const validatorProofBundleV1Type = `tuple(${validatorProofType} validatorProof,${slotProofType} slotProof)`;
const finalBalanceProofBundleV2Type = `tuple(${withdrawalProofType} withdrawalProof,${validatorProofType} validatorProof,${slotProofType} slotProof,${nextWithdrawalIndexProofType} previousNextWithdrawalIndexProof,${validatorBalanceProofType} validatorBalanceProof)`;


// Current pubkey index
let pubkeyIndex = 0;


// Create a new validator pubkey
export function getValidatorPubkey() {
    let index = ++pubkeyIndex;
    return Buffer.from(index.toString(16).padStart(96, '0'), 'hex');
}


// Create a validator signature
export function getValidatorSignature() {
    return Buffer.from(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' +
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' +
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'hex');
}


// Encode the stable version-1 validator proof payload used by manager proof entrypoints
export function encodeValidatorProofV1(validatorProof, slotProof) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        [validatorProofBundleV1Type],
        [{ validatorProof, slotProof }],
    );
}


// Encode the Gloas final-balance payload, including the freshness proof for the
// state immediately preceding withdrawalProof.withdrawalSlot and the packed
// validator balance chunk from the withdrawal slot's post-state
export function encodeFinalBalanceProofV2(
    withdrawalProof,
    validatorProof,
    slotProof,
    previousNextWithdrawalIndexProof,
    validatorBalanceProof,
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        [finalBalanceProofBundleV2Type],
        [{ withdrawalProof, validatorProof, slotProof, previousNextWithdrawalIndexProof, validatorBalanceProof }],
    );
}


// Create validator deposit data root
export function getDepositDataRoot(depositData) {
    return types.DepositData.hashTreeRoot(depositData);
}
