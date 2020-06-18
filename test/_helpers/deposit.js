import { RocketDepositPool } from '../_utils/artifacts';


// Make a deposit
export async function deposit(txOptions) {
    const rocketDepositPool = await RocketDepositPool.deployed();
    await rocketDepositPool.deposit(txOptions);
}


// Assign deposits
export async function assignDeposits(txOptions) {
    const rocketDepositPool = await RocketDepositPool.deployed();
    await rocketDepositPool.assignDeposits(txOptions);
}

