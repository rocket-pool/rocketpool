import assert from "assert";

import type { ProtocolCurrent } from "../../harness";

export async function reduceMegapoolBondAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    amount: bigint,
): Promise<void> {
    const megapool = await protocol.megapools.delegate(node);
    const [bondBefore, capitalBefore] = await Promise.all([
        megapool.getNodeBond(),
        megapool.getUserCapital(),
    ]);
    await protocol.megapools.reduceBond(node, amount);
    assert.equal(await megapool.getNodeBond(), bondBefore - amount);
    assert.equal(await megapool.getUserCapital(), capitalBefore + amount);
}
