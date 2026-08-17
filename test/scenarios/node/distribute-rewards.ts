import assert from "assert";
import { parseEther } from "ethers";

import type { ProtocolCurrent } from "../../harness";

const ETHER = parseEther("1");

export interface DistributeRewardsResult {
    averageFee: bigint;
    expectedNodeAmount: bigint;
    expectedUserAmount: bigint;
    withdrawalDelta: bigint;
    unclaimedDelta: bigint;
    rethDelta: bigint;
}

export async function distributeRewardsAndAssert(
    protocol: ProtocolCurrent,
    options: {
        node: string;
        caller: string;
    },
): Promise<DistributeRewardsResult> {
    const minipools = await protocol.minipools.forNode(options.node);
    const stakingMinipools = minipools.filter(minipool => minipool.status === 2);
    const feeTotal = stakingMinipools.reduce(
        (total, minipool) => total + minipool.nodeFee,
        0n,
    );
    const expectedAverageFee = stakingMinipools.length === 0
        ? 0n
        : feeTotal / BigInt(stakingMinipools.length);
    const averageFee = await protocol.nodes.averageFee(options.node);
    assert.equal(averageFee, expectedAverageFee, "Incorrect average node fee");

    const distributorBalance = await protocol.distributors.balance(options.node);
    const halfAmount = distributorBalance / 2n;
    const expectedNodeAmount = halfAmount + halfAmount * averageFee / ETHER;
    const expectedUserAmount = distributorBalance - expectedNodeAmount;
    const [reportedNodeShare, reportedUserShare] = await Promise.all([
        protocol.distributors.nodeShare(options.node),
        protocol.distributors.userShare(options.node),
    ]);
    assert.equal(reportedNodeShare, expectedNodeAmount, "Incorrect reported node share");
    assert.equal(reportedUserShare, expectedUserAmount, "Incorrect reported user share");

    const before = await getBalances(protocol, options.node);
    await protocol.distributors.distribute(options.node, { caller: options.caller });
    const after = await getBalances(protocol, options.node);

    const withdrawalDelta = after.withdrawal - before.withdrawal;
    const unclaimedDelta = after.unclaimed - before.unclaimed;
    const rethDelta = after.reth - before.reth;
    assert.equal(
        withdrawalDelta + unclaimedDelta,
        expectedNodeAmount,
        "Incorrect node ETH balance change",
    );
    assert.equal(rethDelta, expectedUserAmount, "Incorrect rETH ETH balance change");
    assert.equal(
        await protocol.distributors.balance(options.node),
        0n,
        "Distributor balance was not drained",
    );

    return {
        averageFee,
        expectedNodeAmount,
        expectedUserAmount,
        withdrawalDelta,
        unclaimedDelta,
        rethDelta,
    };
}

async function getBalances(
    protocol: ProtocolCurrent,
    node: string,
): Promise<{ withdrawal: bigint; unclaimed: bigint; reth: bigint }> {
    const [withdrawal, unclaimed, reth] = await Promise.all([
        protocol.nodes.withdrawalBalance(node),
        protocol.nodes.unclaimedRewards(node),
        protocol.distributors.rethBalance(),
    ]);
    return { withdrawal, unclaimed, reth };
}
