import assert from "node:assert/strict";
import type { ProtocolCurrent } from "../../harness";
import { rplStakingSnapshot } from "../node/rpl-staking";

export async function prepareParticipationBonds(current: ProtocolCurrent) {
    await current.nodes.register("proposer");
    await current.nodes.register("responder");
    await current.tokens.mintRpl("proposer", 1000n * 10n ** 18n);
    await current.nodes.stakeRpl("proposer", 1000n * 10n ** 18n);
    await current.nodes.setRplLockingAllowed("proposer", true);
}

export async function participationBondAccounting(current: ProtocolCurrent) {
    return {
        proposer: await rplStakingSnapshot(current, "proposer"),
        responder: await rplStakingSnapshot(current, "responder"),
        supply: await current.contracts.rocketTokenRPL.totalSupply(),
    };
}

export async function assertParticipationBondLocked(current: ProtocolCurrent, id: bigint, before: Awaited<ReturnType<typeof participationBondAccounting>>) {
    const details = await current.contracts.rocketNetworkParticipation.getChallengeBondDetails(id);
    assert.equal(details.proposer, await current.nodes.address("proposer"));
    assert.equal(details.responder, "0x0000000000000000000000000000000000000000");
    assert.equal(details.bondAmount, await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceChallengeBond());
    assert.equal(details.settled, false);
    assert.deepEqual(await participationBondAccounting(current), {
        ...before, proposer: { ...before.proposer, locked: before.proposer.locked + details.bondAmount },
    });
}
