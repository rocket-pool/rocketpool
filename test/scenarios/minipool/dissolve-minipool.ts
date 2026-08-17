import assert from "assert";

import type { ProtocolCurrent, ProtocolV131, ProtocolV14 } from "../../harness";

type MinipoolProtocol = ProtocolV131 | ProtocolV14 | ProtocolCurrent;

export async function dissolveMinipoolAndAssert(
    protocol: MinipoolProtocol,
    name: string,
    options: { caller: string },
): Promise<void> {
    const before = await protocol.minipools.details(name);
    await protocol.minipools.dissolve(name, options);
    const after = await protocol.minipools.details(name);

    assert.notEqual(before.status, 4, "Minipool was already dissolved");
    assert.equal(after.status, 4, "Minipool did not enter dissolved status");
}
