import { RocketDepositPool } from '../_utils/artifacts';

// Assign deposits to minipools
export async function assignDeposits(txOptions) {
    const [
        rocketDepositPool,
    ] = await Promise.all([
        RocketDepositPool.deployed(),
    ]);

    await rocketDepositPool.connect(txOptions.from).assignDeposits();

    // TODO: Check pre and post conditions on assigning deposits
}
