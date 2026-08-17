import assert from "assert";

import type { ProtocolView } from "../../harness";

export async function challengeODAOMemberAndAssert(
    protocol: ProtocolView,
    member: string,
    options: { caller: string; value?: bigint },
): Promise<void> {
    assert.equal(await protocol.odao.members.isValid(member), true);
    assert.equal(await protocol.odao.challenges.isChallenged(member), false);
    await protocol.odao.challenges.make(member, options);
    assert.equal(await protocol.odao.challenges.isChallenged(member), true);
}

export async function decideODAOChallengeAndAssert(
    protocol: ProtocolView,
    member: string,
    expectedValid: boolean,
    options: { caller: string },
): Promise<void> {
    const supplyBefore = await protocol.tokens.rplSupply();
    const bondBefore = await protocol.odao.members.bond(member);
    await protocol.odao.challenges.decide(member, options);
    assert.equal(await protocol.odao.members.isValid(member), expectedValid);
    if (expectedValid) {
        assert.equal(await protocol.tokens.rplSupply(), supplyBefore);
        assert.equal(await protocol.odao.challenges.isChallenged(member), false);
    } else {
        assert(bondBefore > 0n);
        assert.equal(await protocol.odao.members.bond(member), 0n);
        assert.equal(await protocol.tokens.rplSupply(), supplyBefore);
    }
}
