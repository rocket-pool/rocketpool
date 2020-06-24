import {  } from '../_utils/artifacts';
import { getValidatorSignature, getDepositDataRoot } from '../_utils/beacon';


// Stake a minipool
export async function stake(minipool, validatorPubkey, withdrawalCredentials, txOptions) {

    // Get validator deposit data
    let depositData = {
        pubkey: validatorPubkey,
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(32000000000), // gwei
        signature: getValidatorSignature(),
    };
    let depositDataRoot = getDepositDataRoot(depositData);

    // Stake
    await minipool.stake(depositData.pubkey, depositData.signature, depositDataRoot, txOptions);

}

