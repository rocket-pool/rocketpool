import assert from "assert";

import type { ProtocolView } from "../../harness";

export const ODAO_PROPOSAL = {
    pending: 0n,
    active: 1n,
    cancelled: 2n,
    defeated: 3n,
    succeeded: 4n,
    expired: 5n,
    executed: 6n,
} as const;

export async function advanceToODAOProposalStart(
    protocol: ProtocolView,
    id: bigint,
): Promise<void> {
    const start = (await protocol.odao.proposals.details(id)).start;
    const now = await protocol.time.latest();
    if (now <= start) await protocol.time.advance(start - now + 1n);
}

export async function advancePastODAOProposalEnd(
    protocol: ProtocolView,
    id: bigint,
): Promise<void> {
    const end = (await protocol.odao.proposals.details(id)).end;
    const now = await protocol.time.latest();
    if (now <= end) await protocol.time.advance(end - now + 1n);
}

export async function advancePastODAOProposalExpiry(
    protocol: ProtocolView,
    id: bigint,
): Promise<void> {
    const expires = (await protocol.odao.proposals.details(id)).expires;
    const now = await protocol.time.latest();
    if (now <= expires) await protocol.time.advance(expires - now + 1n);
}

export async function proposeODAOAndAssert(
    protocol: ProtocolView,
    message: string,
    payload: string,
    options: { caller: string; respectCooldown?: boolean },
): Promise<bigint> {
    if (options.respectCooldown ?? true) {
        await protocol.time.advance(await protocol.odao.settings.proposals.getCooldown() + 1n);
    }
    const totalBefore = await protocol.odao.proposals.total();
    const id = await protocol.odao.proposals.propose(message, payload, options);
    assert.equal(id, totalBefore + 1n);
    assert.equal((await protocol.odao.proposals.details(id)).state, ODAO_PROPOSAL.pending);
    return id;
}

export async function voteODAOAndAssert(
    protocol: ProtocolView,
    id: bigint,
    support: boolean,
    options: { caller: string },
): Promise<void> {
    const before = await protocol.odao.proposals.details(id);
    await protocol.odao.proposals.vote(id, support, options);
    const after = await protocol.odao.proposals.details(id);
    if (support) {
        assert(after.votesFor > before.votesFor);
        assert.equal(after.votesAgainst, before.votesAgainst);
    } else {
        assert.equal(after.votesFor, before.votesFor);
        assert(after.votesAgainst > before.votesAgainst);
    }
    if (after.state === ODAO_PROPOSAL.active) assert(after.votesFor < after.votesRequired);
    else if (after.state === ODAO_PROPOSAL.succeeded) assert(after.votesFor >= after.votesRequired);
    else assert.fail(`Unexpected oDAO proposal state after vote: ${after.state}`);
}

export async function cancelODAOAndAssert(
    protocol: ProtocolView,
    id: bigint,
    options: { caller: string },
): Promise<void> {
    await protocol.odao.proposals.cancel(id, options);
    assert.equal((await protocol.odao.proposals.details(id)).state, ODAO_PROPOSAL.cancelled);
}

export async function executeODAOAndAssert(
    protocol: ProtocolView,
    id: bigint,
    options: { caller: string },
): Promise<void> {
    await protocol.odao.proposals.execute(id, options);
    assert.equal((await protocol.odao.proposals.details(id)).state, ODAO_PROPOSAL.executed);
}
