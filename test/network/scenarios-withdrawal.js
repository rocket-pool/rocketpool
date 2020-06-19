import { RocketNetworkWithdrawal } from '../_utils/artifacts';


// Deposit a validator withdrawal
export async function depositWithdrawal(txOptions) {

    // Load contracts
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();

    // Deposit withdrawal
    await rocketNetworkWithdrawal.depositWithdrawal(txOptions);

}


// Process a validator withdrawal
export async function processWithdrawal(validatorPubkey, txOptions) {

    // Load contracts
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();

    // Process withdrawal
    await rocketNetworkWithdrawal.processWithdrawal(validatorPubkey, txOptions);

}

