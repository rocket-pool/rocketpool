import assert from "assert";

import type { ProtocolCurrent } from "../../harness";

export async function applyMegapoolPenaltyVoteAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    slot: bigint,
    amount: bigint,
    trustedNode: string,
): Promise<void> {
    const address = await protocol.megapools.address(node);
    const megapool = await protocol.megapools.delegate(node);
    const penalties = protocol.contracts.rocketMegapoolPenalties;
    const signer = await protocol.context.actor(trustedNode);
    const [votesBefore, debtBefore, maxBefore, totalBefore, members] = await Promise.all([
        penalties.getVoteCount(address, slot, amount),
        megapool.getDebt(),
        penalties.getCurrentMaxPenalty(),
        penalties.getCurrentPenaltyRunningTotal(),
        protocol.odao.members.count(),
    ]);
    await (await penalties.connect(signer).penalise(address, slot, amount)).wait();
    const votesAfter = await penalties.getVoteCount(address, slot, amount);
    const expected = votesAfter > members / 2n ? (amount < maxBefore ? amount : maxBefore) : 0n;
    assert.equal(votesAfter, votesBefore + 1n);
    assert.equal(await megapool.getDebt(), debtBefore + expected);
    assert.equal(await penalties.getCurrentMaxPenalty(), maxBefore - expected);
    assert.equal(await penalties.getCurrentPenaltyRunningTotal(), totalBefore + expected);
}
