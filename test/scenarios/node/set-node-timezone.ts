import assert from "assert";

import type { ProtocolCurrent } from "../../harness";

export async function setNodeTimezoneAndAssert(
    protocol: ProtocolCurrent,
    options: {
        node: string;
        timezone: string;
    },
): Promise<{ previousTimezone: string; timezone: string }> {
    const previousTimezone = await protocol.nodes.timezone(options.node);
    await protocol.nodes.setTimezone(options.node, options.timezone);
    const timezone = await protocol.nodes.timezone(options.node);
    assert.equal(timezone, options.timezone, "Incorrect updated node timezone");
    return { previousTimezone, timezone };
}
