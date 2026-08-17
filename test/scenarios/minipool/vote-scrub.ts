import assert from "assert";
import { parseEther, ZeroAddress } from "ethers";

import type { ProtocolCurrent, ProtocolV131 } from "../../harness";

const SCRUB_PENALTY = parseEther("2.4");
const DISSOLVED_STATUS = 4;

type ScrubProtocol = ProtocolV131 | ProtocolCurrent;

export interface VoteScrubResult {
    dissolved: boolean;
    votesBefore: bigint;
    votesAfter: bigint;
    balanceDelta: bigint;
    stakeDelta: bigint;
}

export async function voteScrubScenario(
    protocol: ScrubProtocol,
    options: { minipool: string; caller: string },
): Promise<VoteScrubResult> {
    const entity = protocol.minipools.get(options.minipool);
    const [before, stakeBefore, penaltyEnabled, memberCount] = await Promise.all([
        protocol.minipools.details(options.minipool),
        protocol.nodes.stakedRpl(entity.node),
        protocol.odao.settings.minipools.getScrubPenaltyEnabled(),
        protocol.odao.members.count(),
    ]);

    await protocol.minipools.voteScrub(options.minipool, { caller: options.caller });

    const [after, stakeAfter] = await Promise.all([
        protocol.minipools.details(options.minipool),
        protocol.nodes.stakedRpl(entity.node),
    ]);
    const dissolved = before.scrubVotes + 1n > memberCount / 2n;
    const balanceDelta = after.balance - before.balance;
    const stakeDelta = stakeAfter - stakeBefore;

    if (dissolved) {
        assert.equal(after.status, DISSOLVED_STATUS, "Incorrect updated minipool status");
        if (before.vacant) {
            assert.equal(balanceDelta, 0n, "Vacant minipool balance changed during scrub");
            assert.equal(
                await protocol.minipools.addressForPubkey(before.pubkey),
                ZeroAddress,
                "Vacant minipool pubkey mapping was not removed",
            );
        } else {
            const expectedOutflow = before.userDepositBalance
                + (penaltyEnabled ? SCRUB_PENALTY : 0n);
            assert.equal(
                balanceDelta,
                -expectedOutflow,
                "Incorrect minipool balance change during scrub",
            );
        }
    } else {
        assert.equal(after.scrubVotes, before.scrubVotes + 1n, "Scrub vote was not recorded");
        assert.notEqual(after.status, DISSOLVED_STATUS, "Minipool dissolved before reaching quorum");
        assert.equal(stakeDelta, 0n, "RPL was slashed before scrub quorum");
    }

    return {
        dissolved,
        votesBefore: before.scrubVotes,
        votesAfter: after.scrubVotes,
        balanceDelta,
        stakeDelta,
    };
}
