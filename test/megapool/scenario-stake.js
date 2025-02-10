import { getDepositDataRoot, getValidatorSignature } from '../_utils/beacon';
import { getMegapoolWithdrawalCredentials, getValidatorInfo } from '../_helpers/megapool';

const hre = require('hardhat');

// Stake a megapool validator
export async function stakeMegapoolValidator(megapool, index, txOptions) {
    // Gather info
    const withdrawalCredentials = await getMegapoolWithdrawalCredentials(txOptions.from.address);
    const validatorInfo = await getValidatorInfo(megapool, index);
    // Construct stake deposit
    let depositData = {
        pubkey: Buffer.from(validatorInfo.pubkey.substr(2), 'hex'),
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(31000000000), // gwei
        signature: getValidatorSignature(),
    };
    const depositDataRoot = getDepositDataRoot(depositData);
    // Construct a fake proof
    const proof = {
        slot: 0,
        validatorIndex: 0,
        pubkey: validatorInfo.pubkey,
        withdrawalCredentials: depositData.withdrawalCredentials,
        witnesses: []
    }
    // Perform stake operation
    await megapool.stake(index, depositData.signature, depositDataRoot, proof);
}
