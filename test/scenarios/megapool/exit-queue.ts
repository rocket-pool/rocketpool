import assert from "assert";

import type { ProtocolCurrent } from "../../harness";

export async function exitMegapoolQueueAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    validatorId: bigint,
): Promise<void> {
    const megapool = await protocol.megapools.delegate(node);
    const nodeAddress = await protocol.nodes.address(node);
    const [activeBefore, queuedBondBefore, queuedCapitalBefore, creditBefore] = await Promise.all([
        megapool.getActiveValidatorCount(),
        megapool.getNodeQueuedBond(),
        megapool.getUserQueuedCapital(),
        protocol.contracts.rocketDepositPool.getNodeCreditBalance(nodeAddress),
    ]);
    const info = await megapool.getValidatorInfo(validatorId);
    await protocol.megapools.dequeue(node, validatorId);
    const after = await megapool.getValidatorInfo(validatorId);
    const bond = info.lastRequestedBond * 1_000_000_000_000_000n;
    const value = info.lastRequestedValue * 1_000_000_000_000_000n;
    assert.equal(after.staked, false);
    assert.equal(after.inQueue, false);
    assert.equal(await megapool.getActiveValidatorCount(), activeBefore - 1n);
    assert.equal(await megapool.getNodeQueuedBond(), queuedBondBefore - bond);
    assert.equal(await megapool.getUserQueuedCapital(), queuedCapitalBefore - (value - bond));
    assert.equal(await protocol.contracts.rocketDepositPool.getNodeCreditBalance(nodeAddress), creditBefore + bond);
}
