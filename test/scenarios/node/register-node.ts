import assert from "assert";

import type { ProtocolCurrent } from "../../harness";

export interface RegisterNodeResult {
    address: string;
    countBefore: bigint;
    countAfter: bigint;
    timezone: string;
}

export async function registerNodeAndAssert(
    protocol: ProtocolCurrent,
    options: {
        node: string;
        timezone?: string;
    },
): Promise<RegisterNodeResult> {
    const timezone = options.timezone ?? "Australia/Brisbane";
    const [countBefore, address] = await Promise.all([
        protocol.nodes.count(),
        protocol.nodes.address(options.node),
    ]);

    await protocol.nodes.register(options.node, { timezone });

    const [countAfter, indexedAddress, exists, storedTimezone] = await Promise.all([
        protocol.nodes.count(),
        protocol.nodes.at(countBefore),
        protocol.nodes.exists(options.node),
        protocol.nodes.timezone(options.node),
    ]);
    assert.equal(countAfter, countBefore + 1n, "Incorrect updated node count");
    assert.equal(indexedAddress, address, "Incorrect updated node index");
    assert.equal(exists, true, "Incorrect node exists flag");
    assert.equal(storedTimezone, timezone, "Incorrect node timezone");

    return {
        address,
        countBefore,
        countAfter,
        timezone: storedTimezone,
    };
}
