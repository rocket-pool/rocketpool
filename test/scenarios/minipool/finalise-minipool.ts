import assert from "assert";

import type { ProtocolCurrent, ProtocolV14 } from "../../harness";

type MinipoolProtocol = ProtocolV14 | ProtocolCurrent;

export async function finaliseMinipoolAndAssert(
    protocol: MinipoolProtocol,
    name: string,
    options: { caller?: string } = {},
): Promise<void> {
    const entity = protocol.minipools.get(name);
    const [before, activeBefore] = await Promise.all([
        protocol.minipools.details(name),
        protocol.nodes.activeMinipoolCount(entity.node),
    ]);
    await protocol.minipools.finalise(name, options);
    const [after, activeAfter] = await Promise.all([
        protocol.minipools.details(name),
        protocol.nodes.activeMinipoolCount(entity.node),
    ]);

    assert.equal(before.finalised, false, "Minipool was already finalised");
    assert.equal(after.finalised, true, "Minipool was not finalised");
    assert.equal(activeBefore - activeAfter, 1n, "Active minipool count did not decrement");
}
