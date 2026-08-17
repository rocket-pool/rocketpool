import assert from "assert";

import type { ProtocolCurrent } from "../../harness";

export async function repayMegapoolDebtAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    amount: bigint,
): Promise<void> {
    const megapool = await protocol.megapools.delegate(node);
    const debtBefore = await megapool.getDebt();
    await protocol.megapools.repayDebt(node, amount);
    assert.equal(await megapool.getDebt(), debtBefore - amount);
}
