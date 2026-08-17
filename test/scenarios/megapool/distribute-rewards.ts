import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolCurrent } from "../../harness";

export async function distributeMegapoolRewardsAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    caller = node,
): Promise<void> {
    const megapool = await protocol.megapools.delegate(node);
    const withdrawalAddress = await protocol.nodes.withdrawalAddress(node);
    const expected = await megapool.calculatePendingRewards();
    const [pendingBefore, withdrawalBefore, rethBefore, voterBefore, pdaoBefore, debtBefore, refundBefore] = await Promise.all([
        megapool.getPendingRewards(),
        ethers.provider.getBalance(withdrawalAddress),
        ethers.provider.getBalance(await protocol.contracts.rocketTokenRETH.getAddress()),
        protocol.contracts.rocketVault.balanceOf("rocketRewardsPool"),
        protocol.contracts.rocketVault.balanceOf("rocketClaimDAO"),
        megapool.getDebt(),
        megapool.getRefundValue(),
    ]);
    await protocol.megapools.distribute(node, caller);
    const debtAfter = await megapool.getDebt();
    const debtRepaid = debtBefore - debtAfter;
    assert.equal(await megapool.getPendingRewards(), 0n);
    const nodeCalling = caller === node
        || (await protocol.context.actorAddress(caller)).toLowerCase() === withdrawalAddress.toLowerCase();
    if (nodeCalling) {
        assert.equal(await ethers.provider.getBalance(withdrawalAddress), withdrawalBefore + expected.nodeRewards - debtRepaid);
    } else {
        assert.equal(await ethers.provider.getBalance(withdrawalAddress), withdrawalBefore);
        assert.equal(await megapool.getRefundValue(), refundBefore + expected.nodeRewards - debtRepaid);
    }
    assert.equal(
        await ethers.provider.getBalance(await protocol.contracts.rocketTokenRETH.getAddress()),
        rethBefore + expected.rethRewards + debtRepaid,
    );
    assert.equal(await protocol.contracts.rocketVault.balanceOf("rocketRewardsPool"), voterBefore + expected.voterRewards);
    assert.equal(await protocol.contracts.rocketVault.balanceOf("rocketClaimDAO"), pdaoBefore + expected.protocolDAORewards);
    assert.equal(pendingBefore, expected.nodeRewards + expected.voterRewards + expected.protocolDAORewards + expected.rethRewards);
}
