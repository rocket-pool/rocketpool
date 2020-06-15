import { RocketDepositPool } from '../_utils/artifacts';


// Assign deposits to minipools
export async function assignDeposits(txOptions) {

    // Load contracts
    const rocketDepositPool = await RocketDepositPool.deployed();

    // Assign deposits
    await rocketDepositPool.assignDeposits(txOptions);

}

