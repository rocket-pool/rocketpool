import assert from "assert";

import { time } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolView } from "../../harness";

const PENDING = 0n;
const ACTIVE = 1n;
const SUCCEEDED = 4n;
const EXECUTED = 6n;

async function advancePast(protocol: ProtocolView, timestamp: bigint): Promise<void> {
    const now = BigInt(await time.latest());
    if (now <= timestamp) await protocol.time.advance(timestamp - now + 1n);
}

export async function leaveODAOMemberAndAssert(
    protocol: ProtocolView,
    options: { member: string; voters: readonly string[] },
): Promise<void> {
    const cooldown = await protocol.odao.settings.proposals.getCooldown();
    await protocol.time.advance(cooldown + 1n);

    const memberAddress = await protocol.nodes.address(options.member);
    const payload = protocol.contracts.rocketDAONodeTrustedProposals.interface
        .encodeFunctionData("proposalLeave", [memberAddress]);
    const totalBefore = await protocol.odao.proposals.total();
    const proposalId = await protocol.odao.proposals.propose(
        "Request to leave the oDAO",
        payload,
        { caller: options.member },
    );
    assert.equal(proposalId, totalBefore + 1n);

    let details = await protocol.odao.proposals.details(proposalId);
    assert.equal(details.state, PENDING);
    await advancePast(protocol, details.start);

    for (const voter of options.voters) {
        await protocol.odao.proposals.vote(proposalId, true, { caller: voter });
        details = await protocol.odao.proposals.details(proposalId);
        if (details.state === ACTIVE) {
            assert(details.votesFor < details.votesRequired);
        } else if (details.state === SUCCEEDED) {
            assert(details.votesFor >= details.votesRequired);
        } else {
            assert.fail(`Unexpected proposal state after vote: ${details.state}`);
        }
    }
    assert.equal(details.state, SUCCEEDED);

    await advancePast(protocol, details.end);
    await protocol.odao.proposals.execute(proposalId, { caller: options.voters[0] });
    assert.equal((await protocol.odao.proposals.details(proposalId)).state, EXECUTED);

    const tokenAddress = await protocol.contracts.rocketTokenRPL.getAddress();
    const [countBefore, refundBefore, vaultBefore] = await Promise.all([
        protocol.odao.members.count(),
        protocol.contracts.rocketTokenRPL.balanceOf(memberAddress),
        protocol.contracts.rocketVault.balanceOfToken("rocketDAONodeTrustedActions", tokenAddress),
    ]);
    await protocol.odao.members.leave(options.member);
    const [countAfter, refundAfter, vaultAfter] = await Promise.all([
        protocol.odao.members.count(),
        protocol.contracts.rocketTokenRPL.balanceOf(memberAddress),
        protocol.contracts.rocketVault.balanceOfToken("rocketDAONodeTrustedActions", tokenAddress),
    ]);
    const refund = refundAfter - refundBefore;
    assert.equal(countAfter, countBefore - 1n);
    assert(refund > 0n);
    assert.equal(vaultBefore - vaultAfter, refund);
}
