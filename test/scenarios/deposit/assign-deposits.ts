import assert from "assert";

import type { ProtocolCurrent, ProtocolV14 } from "../../harness";

export async function assignDepositsAndAssert(
    protocol: ProtocolV14 | ProtocolCurrent,
    options: { caller: string; max: bigint },
): Promise<void> {
    const before = await protocol.depositPool.queueLength();
    await protocol.depositPool.assign(options.max, { caller: options.caller });
    const after = await protocol.depositPool.queueLength();
    assert.equal(after, before <= options.max ? 0n : before - options.max);
}
