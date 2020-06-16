import { RocketNetworkWithdrawal } from '../_utils/artifacts';


// Process a validator withdrawal
export async function withdraw(validatorPubkey, txOptions) {

    // Load contracts
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();

    // Process withdrawal
    await rocketNetworkWithdrawal.withdraw(validatorPubkey, txOptions);

}

