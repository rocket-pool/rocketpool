import assert from "assert";

import type { ProtocolView } from "../../harness";

const PENDING = 0n;
const SUCCEEDED = 4n;
const EXECUTED = 6n;

export async function kickODAOMemberAndAssert(
    protocol: ProtocolView,
    options: { member: string; voters: readonly string[]; proposer?: string; fine?: bigint },
): Promise<void> {
    await protocol.time.advance(await protocol.odao.settings.proposals.getCooldown() + 1n);
    const memberAddress = await protocol.nodes.address(options.member);
    const payload = protocol.contracts.rocketDAONodeTrustedProposals.interface.encodeFunctionData(
        "proposalKick",
        [memberAddress, options.fine ?? 0n],
    );
    const proposalId = await protocol.odao.proposals.propose(
        `Kick ${memberAddress}`,
        payload,
        { caller: options.proposer ?? options.voters[0] },
    );
    let details = await protocol.odao.proposals.details(proposalId);
    assert.equal(details.state, PENDING);
    const now = await protocol.time.latest();
    if (now <= details.start) await protocol.time.advance(details.start - now + 1n);
    for (const voter of options.voters) {
        await protocol.odao.proposals.vote(proposalId, true, { caller: voter });
    }
    details = await protocol.odao.proposals.details(proposalId);
    assert.equal(details.state, SUCCEEDED);
    const fine = options.fine ?? 0n;
    const bond = await protocol.odao.members.bond(options.member);
    const token = protocol.contracts.rocketTokenRPL;
    const [balanceBefore, supplyBefore] = await Promise.all([
        token.balanceOf(memberAddress),
        token.totalSupply(),
    ]);
    const countBefore = await protocol.odao.members.count();
    assert.equal(await protocol.contracts.rocketDAONodeTrusted.getMemberIsValid(memberAddress), true);
    await protocol.odao.proposals.execute(proposalId, { caller: options.voters[0] });
    assert.equal((await protocol.odao.proposals.details(proposalId)).state, EXECUTED);
    assert.equal(await protocol.odao.members.count(), countBefore - 1n);
    assert.equal(await protocol.contracts.rocketDAONodeTrusted.getMemberIsValid(memberAddress), false);
    assert.equal(await token.balanceOf(memberAddress), balanceBefore + bond - fine);
    assert.equal(await token.totalSupply(), supplyBefore - fine);
}
