import { RocketNetworkWithdrawal, RocketVault } from '../_utils/artifacts';


// Process a validator withdrawal
export async function processWithdrawal(validatorPubkey, txOptions) {

    // Load contracts
    const [
        rocketNetworkWithdrawal,
        rocketVault,
    ] = await Promise.all([
        RocketNetworkWithdrawal.deployed(),
        RocketVault.deployed(),
    ]);

    // Process withdrawal
    await rocketNetworkWithdrawal.processWithdrawal(validatorPubkey, txOptions);

}

