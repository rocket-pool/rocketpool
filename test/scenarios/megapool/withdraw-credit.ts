import assert from "assert";

import type { ProtocolCurrent } from "../../harness";

export async function withdrawMegapoolCreditAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    amount: bigint,
    caller = node,
): Promise<void> {
    const nodeAddress = await protocol.nodes.address(node);
    const withdrawalAddress = await protocol.nodes.withdrawalAddress(node);
    const [creditBefore, rethBefore] = await Promise.all([
        protocol.contracts.rocketDepositPool.getNodeCreditBalance(nodeAddress),
        protocol.contracts.rocketTokenRETH.balanceOf(withdrawalAddress),
    ]);
    const signer = await protocol.context.actor(caller);
    if (caller === node) {
        await (await protocol.contracts.rocketDepositPool.connect(signer).withdrawCredit(amount)).wait();
    } else {
        await (await protocol.contracts.rocketDepositPool.connect(signer).withdrawCreditFor(nodeAddress, amount)).wait();
    }
    assert.equal(
        await protocol.contracts.rocketDepositPool.getNodeCreditBalance(nodeAddress),
        creditBefore - amount,
    );
    assert.equal(await protocol.contracts.rocketTokenRETH.balanceOf(withdrawalAddress) > rethBefore, true);
}
