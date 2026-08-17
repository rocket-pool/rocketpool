import assert from "assert";

import type { ProtocolV131 } from "../../harness";

export async function reduceBondAndAssert(
    protocol: ProtocolV131,
    name: string,
): Promise<void> {
    const entity = protocol.minipools.get(name);
    const reduction = await protocol.minipools.bondReduction(name);
    const before = await protocol.minipools.details(name);
    const [creditBefore, borrowedBefore, totalBefore, previousCountBefore, newCountBefore] = await Promise.all([
        protocol.nodes.depositCredit(entity.node),
        protocol.nodes.borrowedEth(entity.node),
        protocol.nodes.activeMinipoolCount(entity.node),
        protocol.nodes.stakingMinipoolCountByBond(entity.node, before.nodeDepositBalance),
        protocol.nodes.stakingMinipoolCountByBond(entity.node, reduction.value),
    ]);

    await protocol.minipools.reduceBond(name);

    const after = await protocol.minipools.details(name);
    const [creditAfter, borrowedAfter, totalAfter, previousCountAfter, newCountAfter] = await Promise.all([
        protocol.nodes.depositCredit(entity.node),
        protocol.nodes.borrowedEth(entity.node),
        protocol.nodes.activeMinipoolCount(entity.node),
        protocol.nodes.stakingMinipoolCountByBond(entity.node, before.nodeDepositBalance),
        protocol.nodes.stakingMinipoolCountByBond(entity.node, reduction.value),
    ]);
    const delta = before.nodeDepositBalance - reduction.value;

    assert.equal(after.nodeDepositBalance, reduction.value, "Incorrect reduced node bond");
    assert.equal(after.userDepositBalance - before.userDepositBalance, delta, "Incorrect user capital change");
    assert.equal(creditAfter - creditBefore, delta, "Incorrect node deposit credit change");
    assert.equal(borrowedAfter - borrowedBefore, delta, "Incorrect node borrowed ETH change");
    assert.equal(totalAfter, totalBefore, "Active minipool count changed during bond reduction");
    assert.equal(previousCountBefore - previousCountAfter, 1n, "Previous bond count did not decrement");
    assert.equal(newCountAfter - newCountBefore, 1n, "New bond count did not increment");
}
