import { RocketDepositPool } from '../_utils/artifacts';


// Make a deposit
export async function deposit(txOptions) {
    const rocketDepositPool = await RocketDepositPool.deployed();
    await rocketDepositPool.deposit(txOptions);
}

