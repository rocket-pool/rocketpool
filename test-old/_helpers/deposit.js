import { RocketDepositPool } from '../_utils/artifacts';

// Get the deposit pool excess ETH balance
export async function getDepositExcessBalance() {
    const rocketDepositPool = await RocketDepositPool.deployed();
    return rocketDepositPool.getExcessBalance.call();
}

// Make a deposit
export async function userDeposit(txOptions) {
    const rocketDepositPool = await RocketDepositPool.deployed();
    await rocketDepositPool.connect(txOptions.from).deposit(txOptions);
}

// Assign deposits
export async function assignDeposits(txOptions) {
    const rocketDepositPool = await RocketDepositPool.deployed();
    await rocketDepositPool.assignDeposits(txOptions);
}

