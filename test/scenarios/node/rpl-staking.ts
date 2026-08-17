import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolCurrent, ProtocolV14 } from "../../harness";

export type RplStakingProtocol = ProtocolV14 | ProtocolCurrent;

export interface RplStakingSnapshot {
    withdrawalRpl: bigint;
    vaultRpl: bigint;
    stakingRpl: bigint;
    total: bigint;
    totalMega: bigint;
    totalLegacy: bigint;
    nodeTotal: bigint;
    nodeMega: bigint;
    nodeLegacy: bigint;
    lastStake: bigint;
    lastUnstake: bigint;
    unstaking: bigint;
    locked: bigint;
}

export async function rplStakingSnapshot(
    protocol: RplStakingProtocol,
    node: string,
): Promise<RplStakingSnapshot> {
    const address = await protocol.nodes.address(node);
    const staking = protocol.contracts.rocketNodeStaking;
    const rpl = protocol.contracts.rocketTokenRPL;
    const vault = protocol.contracts.rocketVault;
    const withdrawal = await protocol.contracts.rocketNodeManager.getNodeRPLWithdrawalAddress(address);
    const [
        withdrawalRpl,
        vaultRpl,
        stakingRpl,
        total,
        totalMega,
        totalLegacy,
        nodeTotal,
        nodeMega,
        nodeLegacy,
        lastStake,
        lastUnstake,
        unstaking,
        locked,
    ] = await Promise.all([
        rpl.balanceOf(withdrawal),
        rpl.balanceOf(await vault.getAddress()),
        vault.balanceOfToken("rocketNodeStaking", await rpl.getAddress()),
        staking.getTotalStakedRPL(),
        staking.getTotalMegapoolStakedRPL(),
        staking.getTotalLegacyStakedRPL(),
        staking.getNodeStakedRPL(address),
        staking.getNodeMegapoolStakedRPL(address),
        staking.getNodeLegacyStakedRPL(address),
        staking.getNodeRPLStakedTime(address),
        staking.getNodeLastUnstakeTime(address),
        staking.getNodeUnstakingRPL(address),
        staking.getNodeLockedRPL(address),
    ]);
    return {
        withdrawalRpl,
        vaultRpl,
        stakingRpl,
        total,
        totalMega,
        totalLegacy,
        nodeTotal,
        nodeMega,
        nodeLegacy,
        lastStake,
        lastUnstake,
        unstaking,
        locked,
    };
}

export async function stakeRplAndAssert(
    protocol: RplStakingProtocol,
    node: string,
    amount: bigint,
    options: { caller?: string } = {},
): Promise<void> {
    const caller = options.caller ?? node;
    const callerAddress = await protocol.nodes.address(caller);
    const before = await rplStakingSnapshot(protocol, node);
    const callerBefore = await protocol.contracts.rocketTokenRPL.balanceOf(callerAddress);

    if (caller === node) await protocol.nodes.stakeRpl(node, amount);
    else await protocol.nodes.stakeRplFor(node, amount, { caller });

    const after = await rplStakingSnapshot(protocol, node);
    assert.equal(await protocol.contracts.rocketTokenRPL.balanceOf(callerAddress), callerBefore - amount);
    assert.equal(after.vaultRpl - before.vaultRpl, amount);
    assert.equal(after.stakingRpl - before.stakingRpl, amount);
    assert.equal(after.total - before.total, amount);
    assert.equal(after.totalMega - before.totalMega, amount);
    assert.equal(after.totalLegacy - before.totalLegacy, 0n);
    assert.equal(after.nodeTotal - before.nodeTotal, amount);
    assert.equal(after.nodeMega - before.nodeMega, amount);
    assert.equal(after.nodeLegacy - before.nodeLegacy, 0n);
}

async function automaticWithdrawal(
    protocol: RplStakingProtocol,
    before: RplStakingSnapshot,
    transactionTimestamp: bigint,
): Promise<bigint> {
    const settings = protocol.contracts.rocketDAOProtocolSettingsNode;
    const [unstakingPeriod, withdrawalCooldown] = await Promise.all([
        settings.getUnstakingPeriod(),
        settings.getWithdrawalCooldown(),
    ]);
    const unstakingReady = transactionTimestamp - before.lastUnstake > unstakingPeriod;
    const cooldownReady = transactionTimestamp - before.lastStake >= withdrawalCooldown;
    return unstakingReady && cooldownReady ? before.unstaking : 0n;
}

async function latestBlockTimestamp(): Promise<bigint> {
    const block = await ethers.provider.getBlock("latest");
    if (!block) throw new Error("Latest block was not found after RPL staking transaction");
    return BigInt(block.timestamp);
}

export async function unstakeRplAndAssert(
    protocol: RplStakingProtocol,
    node: string,
    amount: bigint,
    options: { caller?: string } = {},
): Promise<void> {
    const before = await rplStakingSnapshot(protocol, node);
    await protocol.nodes.unstakeRpl(node, amount, options);
    const timestamp = await latestBlockTimestamp();
    const after = await rplStakingSnapshot(protocol, node);
    const withdrawn = await automaticWithdrawal(protocol, before, timestamp);

    assert.equal(after.lastUnstake, timestamp);
    assert.equal(after.withdrawalRpl - before.withdrawalRpl, withdrawn);
    assert.equal(after.vaultRpl - before.vaultRpl, -withdrawn);
    assert.equal(after.stakingRpl - before.stakingRpl, -withdrawn);
    assert.equal(after.total - before.total, -amount);
    assert.equal(after.totalMega - before.totalMega, -amount);
    assert.equal(after.totalLegacy - before.totalLegacy, 0n);
    assert.equal(after.nodeTotal - before.nodeTotal, -amount);
    assert.equal(after.nodeMega - before.nodeMega, -amount);
    assert.equal(after.nodeLegacy - before.nodeLegacy, 0n);
    assert.equal(after.unstaking - before.unstaking, amount - withdrawn);
}

export async function unstakeLegacyRplAndAssert(
    protocol: RplStakingProtocol,
    node: string,
    amount: bigint,
    options: { caller?: string } = {},
): Promise<void> {
    const before = await rplStakingSnapshot(protocol, node);
    await protocol.nodes.unstakeLegacyRpl(node, amount, options);
    const timestamp = await latestBlockTimestamp();
    const after = await rplStakingSnapshot(protocol, node);
    const withdrawn = await automaticWithdrawal(protocol, before, timestamp);

    assert.equal(after.lastUnstake, timestamp);
    assert.equal(after.withdrawalRpl - before.withdrawalRpl, withdrawn);
    assert.equal(after.vaultRpl - before.vaultRpl, -withdrawn);
    assert.equal(after.stakingRpl - before.stakingRpl, -withdrawn);
    assert.equal(after.total - before.total, -amount);
    assert.equal(after.totalMega - before.totalMega, 0n);
    assert.equal(after.totalLegacy - before.totalLegacy, -amount);
    assert.equal(after.nodeTotal - before.nodeTotal, -amount);
    assert.equal(after.nodeMega - before.nodeMega, 0n);
    assert.equal(after.nodeLegacy - before.nodeLegacy, -amount);
    assert.equal(after.unstaking - before.unstaking, amount - withdrawn);
}

export async function withdrawRplAndAssert(
    protocol: RplStakingProtocol,
    node: string,
    options: { caller?: string } = {},
): Promise<void> {
    const before = await rplStakingSnapshot(protocol, node);
    await protocol.nodes.withdrawRpl(node, options);
    const after = await rplStakingSnapshot(protocol, node);

    assert.equal(after.unstaking, 0n);
    assert.equal(after.withdrawalRpl - before.withdrawalRpl, before.unstaking);
    assert.equal(after.vaultRpl - before.vaultRpl, -before.unstaking);
    assert.equal(after.stakingRpl - before.stakingRpl, -before.unstaking);
    assert.equal(after.total - before.total, 0n);
    assert.equal(after.totalMega - before.totalMega, 0n);
    assert.equal(after.totalLegacy - before.totalLegacy, 0n);
    assert.equal(after.nodeTotal - before.nodeTotal, 0n);
    assert.equal(after.nodeMega - before.nodeMega, 0n);
    assert.equal(after.nodeLegacy - before.nodeLegacy, 0n);
}
