import assert from "assert";

import type { ProtocolView } from "../../harness";

export async function transferRethAndAssert(
    protocol: ProtocolView,
    options: { from: string; to: string; amount: bigint },
): Promise<void> {
    const [senderBefore, recipientBefore] = await Promise.all([
        protocol.tokens.rethBalance(options.from),
        protocol.tokens.rethBalance(options.to),
    ]);

    await protocol.tokens.transferReth(options.from, options.to, options.amount);

    const [senderAfter, recipientAfter] = await Promise.all([
        protocol.tokens.rethBalance(options.from),
        protocol.tokens.rethBalance(options.to),
    ]);
    assert.equal(senderAfter, senderBefore - options.amount, "Sender rETH balance delta was incorrect");
    assert.equal(recipientAfter, recipientBefore + options.amount, "Recipient rETH balance delta was incorrect");
}
