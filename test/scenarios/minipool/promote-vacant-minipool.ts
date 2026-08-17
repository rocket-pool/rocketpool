import assert from "assert";

import type { ProtocolCurrent, ProtocolV131 } from "../../harness";

const STAKING_STATUS = 2;

type VacantProtocol = ProtocolV131 | ProtocolCurrent;

export interface PromoteVacantMinipoolResult {
    creditDelta: bigint;
}

export async function promoteVacantMinipoolScenario(
    protocol: VacantProtocol,
    name: string,
): Promise<PromoteVacantMinipoolResult> {
    const entity = protocol.minipools.get(name);
    const [before, creditBefore] = await Promise.all([
        protocol.minipools.details(name),
        protocol.nodes.depositCredit(entity.node),
    ]);

    await protocol.minipools.promote(name);

    const [after, creditAfter, reverseAddress] = await Promise.all([
        protocol.minipools.details(name),
        protocol.nodes.depositCredit(entity.node),
        protocol.minipools.addressForPubkey(before.pubkey),
    ]);
    const creditDelta = creditAfter - creditBefore;

    assert.equal(after.status, STAKING_STATUS, "Incorrect promoted minipool status");
    assert.equal(after.vacant, false, "Promoted minipool remained vacant");
    assert.equal(
        creditDelta,
        before.userDepositBalance,
        "Incorrect node deposit credit change",
    );
    assert.equal(
        reverseAddress,
        entity.address,
        "Promoted minipool pubkey mapping was removed",
    );

    return { creditDelta };
}
