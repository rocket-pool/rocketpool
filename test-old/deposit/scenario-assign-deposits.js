import { RocketDepositPool } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

// Assign deposits to minipools
export async function assignDeposits(max = 1n, txOptions) {
    const [
        rocketDepositPool,
    ] = await Promise.all([
        RocketDepositPool.deployed(),
    ]);

    const queueLengthBefore = await rocketDepositPool.getTotalQueueLength();

    await rocketDepositPool.connect(txOptions.from).assignDeposits(max);

    const queueLengthAfter = await rocketDepositPool.getTotalQueueLength();

    if (queueLengthBefore <= max) {
        assertBN.equal(queueLengthAfter, 0n);
    } else {
        const queueLengthDelta = queueLengthAfter - queueLengthBefore;
        assertBN.equal(queueLengthDelta, -max);
    }
}
