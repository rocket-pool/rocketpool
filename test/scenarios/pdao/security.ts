import assert from "assert";

import type { ProtocolCurrent, ProtocolV14, ProtocolView } from "../../harness";

const PENDING = 0n;
const ACTIVE = 1n;
const SUCCEEDED = 4n;
const EXECUTED = 6n;

type UpgradeProtocol = ProtocolV14 | ProtocolCurrent;

async function advanceToStart(protocol: ProtocolView, start: bigint): Promise<void> {
    const now = await protocol.time.latest();
    if (now <= start) await protocol.time.advance(start - now + 1n);
}

export async function bootstrapSecurityMemberAndAssert(
    protocol: ProtocolView,
    member: string,
    options: { id: string },
): Promise<void> {
    const countBefore = await protocol.pdao.security.members.count();
    assert.equal(await protocol.pdao.security.members.isMember(member), false);
    await protocol.pdao.security.members.invite(member, options);
    await protocol.pdao.security.members.join(member);
    assert.equal(await protocol.pdao.security.members.count(), countBefore + 1n);
    assert.equal(await protocol.pdao.security.members.isMember(member), true);
}

export async function leaveSecurityCouncilAndAssert(
    protocol: ProtocolView,
    member: string,
): Promise<void> {
    const countBefore = await protocol.pdao.security.members.count();
    await protocol.pdao.security.members.leave(member);
    assert.equal(await protocol.pdao.security.members.count(), countBefore - 1n);
    assert.equal(await protocol.pdao.security.members.isMember(member), false);
}

export async function proposeSecuritySettingAndAssert(
    protocol: ProtocolView,
    options: {
        message: string;
        caller: string;
        namespace: string;
        path: string;
        value: boolean | bigint;
    },
): Promise<bigint> {
    const payload = typeof options.value === "boolean"
        ? protocol.contracts.rocketDAOSecurityProposals.interface.encodeFunctionData(
            "proposalSettingBool",
            [options.namespace, options.path, options.value],
        )
        : protocol.contracts.rocketDAOSecurityProposals.interface.encodeFunctionData(
            "proposalSettingUint",
            [options.namespace, options.path, options.value],
        );
    const totalBefore = await protocol.pdao.security.proposals.total();
    const proposalId = await protocol.pdao.security.proposals.propose(
        options.message,
        payload,
        { caller: options.caller },
    );
    assert.equal(proposalId, totalBefore + 1n);
    assert.equal((await protocol.pdao.security.proposals.details(proposalId)).state, PENDING);
    return proposalId;
}

export async function voteSecurityProposalAndAssert(
    protocol: ProtocolView,
    proposalId: bigint,
    support: boolean,
    options: { caller: string },
): Promise<void> {
    const before = await protocol.pdao.security.proposals.details(proposalId);
    await advanceToStart(protocol, before.start);
    await protocol.pdao.security.proposals.vote(proposalId, support, options);
    const after = await protocol.pdao.security.proposals.details(proposalId);
    assert.equal(
        after.votesFor - before.votesFor,
        support ? 10n ** 18n : 0n,
        "Security proposal vote total changed incorrectly",
    );
    if (after.state === ACTIVE) {
        assert(after.votesFor < after.votesRequired);
    } else if (after.state === SUCCEEDED) {
        assert(after.votesFor >= after.votesRequired);
    } else {
        assert.fail(`Unexpected security proposal state after vote: ${after.state}`);
    }
}

export async function executeSecurityProposalAndAssert(
    protocol: ProtocolView,
    proposalId: bigint,
    options: { caller: string },
): Promise<void> {
    await protocol.pdao.security.proposals.execute(proposalId, options);
    assert.equal(
        (await protocol.pdao.security.proposals.details(proposalId)).state,
        EXECUTED,
    );
}

export async function proposeUpgradeVetoAndAssert(
    protocol: UpgradeProtocol,
    upgradeId: bigint,
    options: { message: string; caller: string },
): Promise<bigint> {
    const totalBefore = await protocol.pdao.security.proposals.total();
    const proposalId = await protocol.pdao.security.upgrades.proposeVeto(
        options.message,
        upgradeId,
        { caller: options.caller },
    );
    assert.equal(proposalId, totalBefore + 1n);
    assert.equal((await protocol.pdao.security.proposals.details(proposalId)).state, PENDING);
    return proposalId;
}

export async function voteUpgradeVetoAndAssert(
    protocol: UpgradeProtocol,
    proposalId: bigint,
    support: boolean,
    options: { caller: string },
): Promise<void> {
    const before = await protocol.pdao.security.proposals.details(proposalId);
    await advanceToStart(protocol, before.start);
    await protocol.pdao.security.upgrades.vote(proposalId, support, options);
    const after = await protocol.pdao.security.proposals.details(proposalId);
    if (after.state === ACTIVE) assert(after.votesFor < after.votesRequired);
    else if (after.state === SUCCEEDED) assert(after.votesFor >= after.votesRequired);
    else assert.fail(`Unexpected veto proposal state after vote: ${after.state}`);
}

export async function executeUpgradeVetoAndAssert(
    protocol: UpgradeProtocol,
    proposalId: bigint,
    upgradeId: bigint,
    options: { caller: string },
): Promise<void> {
    await protocol.pdao.security.upgrades.execute(proposalId, options);
    assert.equal(
        (await protocol.pdao.security.proposals.details(proposalId)).state,
        EXECUTED,
    );
    assert.equal(await protocol.odao.upgrades.vetoed(upgradeId), true);
}
