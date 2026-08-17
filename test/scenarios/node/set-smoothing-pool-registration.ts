import assert from "assert";

import type { ProtocolCurrent } from "../../harness";

export async function setSmoothingPoolRegistrationAndAssert(
    protocol: ProtocolCurrent,
    options: {
        node: string;
        state: boolean;
    },
): Promise<{ state: boolean }> {
    await protocol.nodes.setSmoothingPoolRegistration(options.node, options.state);
    const state = await protocol.nodes.smoothingPoolRegistration(options.node);
    assert.equal(state, options.state, "Incorrect smoothing pool registration state");
    return { state };
}
