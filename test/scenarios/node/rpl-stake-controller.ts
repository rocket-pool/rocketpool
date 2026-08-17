import assert from "assert";

import type { RplStakeControllerFixture } from "../../harness";
import {
    rplStakingSnapshot,
    type RplStakingProtocol,
    type RplStakingSnapshot,
} from "./rpl-staking";

function assertStakeUnchanged(
    before: RplStakingSnapshot,
    after: RplStakingSnapshot,
): void {
    assert.equal(after.vaultRpl, before.vaultRpl);
    assert.equal(after.stakingRpl, before.stakingRpl);
    assert.equal(after.total, before.total);
    assert.equal(after.totalMega, before.totalMega);
    assert.equal(after.totalLegacy, before.totalLegacy);
    assert.equal(after.nodeTotal, before.nodeTotal);
    assert.equal(after.nodeMega, before.nodeMega);
    assert.equal(after.nodeLegacy, before.nodeLegacy);
    assert.equal(after.unstaking, before.unstaking);
}

export async function lockRplAndAssert(
    protocol: RplStakingProtocol,
    controller: RplStakeControllerFixture,
    node: string,
    amount: bigint,
): Promise<void> {
    const before = await rplStakingSnapshot(protocol, node);
    await controller.lock(node, amount);
    const after = await rplStakingSnapshot(protocol, node);

    assertStakeUnchanged(before, after);
    assert.equal(after.locked - before.locked, amount);
}

export async function unlockRplAndAssert(
    protocol: RplStakingProtocol,
    controller: RplStakeControllerFixture,
    node: string,
    amount: bigint,
): Promise<void> {
    const before = await rplStakingSnapshot(protocol, node);
    await controller.unlock(node, amount);
    const after = await rplStakingSnapshot(protocol, node);

    assertStakeUnchanged(before, after);
    assert.equal(after.locked - before.locked, -amount);
}

export async function transferStakedRplAndAssert(
    protocol: RplStakingProtocol,
    controller: RplStakeControllerFixture,
    from: string,
    to: string,
    amount: bigint,
): Promise<void> {
    const [fromBefore, toBefore] = await Promise.all([
        rplStakingSnapshot(protocol, from),
        rplStakingSnapshot(protocol, to),
    ]);
    await controller.transfer(from, to, amount);
    const [fromAfter, toAfter] = await Promise.all([
        rplStakingSnapshot(protocol, from),
        rplStakingSnapshot(protocol, to),
    ]);
    const legacyMoved = amount < fromBefore.nodeLegacy ? amount : fromBefore.nodeLegacy;
    const megapoolMoved = amount - legacyMoved;

    assert.equal(fromAfter.nodeTotal - fromBefore.nodeTotal, -amount);
    assert.equal(fromAfter.nodeLegacy - fromBefore.nodeLegacy, -legacyMoved);
    assert.equal(fromAfter.nodeMega - fromBefore.nodeMega, -megapoolMoved);
    assert.equal(toAfter.nodeTotal - toBefore.nodeTotal, amount);
    assert.equal(toAfter.nodeLegacy, toBefore.nodeLegacy);
    assert.equal(toAfter.nodeMega - toBefore.nodeMega, amount);

    assert.equal(fromAfter.total, fromBefore.total);
    assert.equal(fromAfter.totalMega - fromBefore.totalMega, legacyMoved);
    assert.equal(fromAfter.totalLegacy - fromBefore.totalLegacy, -legacyMoved);
    assert.equal(fromAfter.vaultRpl, fromBefore.vaultRpl);
    assert.equal(fromAfter.stakingRpl, fromBefore.stakingRpl);
    assert.equal(fromAfter.unstaking, fromBefore.unstaking);
    assert.equal(toAfter.unstaking, toBefore.unstaking);
}

export async function burnStakedRplAndAssert(
    protocol: RplStakingProtocol,
    controller: RplStakeControllerFixture,
    node: string,
    amount: bigint,
): Promise<void> {
    const before = await rplStakingSnapshot(protocol, node);
    const supplyBefore = await protocol.contracts.rocketTokenRPL.totalSupply();
    await controller.burn(node, amount);
    const after = await rplStakingSnapshot(protocol, node);
    const supplyAfter = await protocol.contracts.rocketTokenRPL.totalSupply();
    const legacyBurned = amount < before.nodeLegacy ? amount : before.nodeLegacy;
    const megapoolBurned = amount - legacyBurned;

    assert.equal(after.nodeTotal - before.nodeTotal, -amount);
    assert.equal(after.nodeLegacy - before.nodeLegacy, -legacyBurned);
    assert.equal(after.nodeMega - before.nodeMega, -megapoolBurned);
    assert.equal(after.total - before.total, -amount);
    assert.equal(after.totalLegacy - before.totalLegacy, -legacyBurned);
    assert.equal(after.totalMega - before.totalMega, -megapoolBurned);
    assert.equal(after.vaultRpl - before.vaultRpl, -amount);
    assert.equal(after.stakingRpl - before.stakingRpl, -amount);
    assert.equal(supplyAfter - supplyBefore, -amount);
    assert.equal(after.unstaking, before.unstaking);
    assert.equal(after.locked, before.locked);
}
