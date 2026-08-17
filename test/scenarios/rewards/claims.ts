import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolCurrent, ProtocolV14, RewardClaim } from "../../harness";
import { buildRewardTree, type RewardRow } from "./reward-tree";

type RewardProtocol = ProtocolV14 | ProtocolCurrent;

export function rewardClaims(
    nodeAddress: string,
    indices: bigint[],
    rows: RewardRow[][],
): RewardClaim[] {
    return indices.map((rewardIndex, index) => {
        const proof = buildRewardTree(rows[index], 1).claims.get(ethers.getAddress(nodeAddress));
        if (!proof) throw new Error(`No reward proof for ${nodeAddress}`);
        return {
            rewardIndex,
            amountRPL: proof.amountRpl,
            amountSmoothingPoolETH: proof.amountNodeEth,
            amountVoterETH: proof.amountVoterEth,
            merkleProof: proof.proof,
        };
    });
}

async function balances(protocol: RewardProtocol, node: string) {
    const [withdrawal, rplWithdrawal] = await Promise.all([
        protocol.nodes.withdrawalAddress(node),
        protocol.nodes.rplWithdrawalAddress(node),
    ]);
    const [rplValue, withdrawalEthValue, rplWithdrawalEthValue, stakedValue,
        withdrawalOutstandingValue, rplWithdrawalOutstandingValue] = await Promise.all([
        protocol.contracts.rocketTokenRPL.balanceOf(rplWithdrawal),
        ethers.provider.getBalance(withdrawal),
        ethers.provider.getBalance(rplWithdrawal),
        protocol.nodes.stakedRpl(node),
        protocol.rewards.outstandingEth(withdrawal),
        protocol.rewards.outstandingEth(rplWithdrawal),
    ]);
    return {
        withdrawal,
        rplWithdrawal,
        rpl: BigInt(rplValue),
        withdrawalEth: BigInt(withdrawalEthValue),
        rplWithdrawalEth: BigInt(rplWithdrawalEthValue),
        staked: BigInt(stakedValue),
        withdrawalOutstanding: BigInt(withdrawalOutstandingValue),
        rplWithdrawalOutstanding: BigInt(rplWithdrawalOutstandingValue),
    };
}

function totals(claims: RewardClaim[]) {
    return claims.reduce((result, claim) => ({
        rpl: result.rpl + claim.amountRPL,
        nodeEth: result.nodeEth + claim.amountSmoothingPoolETH,
        voterEth: result.voterEth + claim.amountVoterETH,
    }), { rpl: 0n, nodeEth: 0n, voterEth: 0n });
}

function gasFor(address: string, caller: string, gas: bigint): bigint {
    return address.toLowerCase() === caller.toLowerCase() ? gas : 0n;
}

function assertEthDeltas(
    before: Awaited<ReturnType<typeof balances>>,
    after: Awaited<ReturnType<typeof balances>>,
    expected: { nodeEth: bigint; voterEth: bigint },
    caller: string,
    gas: bigint,
): void {
    if (before.withdrawal.toLowerCase() === before.rplWithdrawal.toLowerCase()) {
        assert.equal(
            after.withdrawalEth - before.withdrawalEth
                + after.withdrawalOutstanding - before.withdrawalOutstanding
                + gasFor(before.withdrawal, caller, gas),
            expected.nodeEth + expected.voterEth,
        );
        return;
    }
    assert.equal(
        after.withdrawalEth - before.withdrawalEth
            + after.withdrawalOutstanding - before.withdrawalOutstanding
            + gasFor(before.withdrawal, caller, gas),
        expected.nodeEth,
    );
    assert.equal(
        after.rplWithdrawalEth - before.rplWithdrawalEth
            + after.rplWithdrawalOutstanding - before.rplWithdrawalOutstanding
            + gasFor(before.rplWithdrawal, caller, gas),
        expected.voterEth,
    );
}

export async function claimRewardsAndAssert(
    protocol: RewardProtocol,
    options: { node: string; caller?: string; indices: bigint[]; rows: RewardRow[][] },
): Promise<void> {
    const nodeAddress = await protocol.nodes.address(options.node);
    const caller = await protocol.nodes.address(options.caller ?? options.node);
    const claims = rewardClaims(nodeAddress, options.indices, options.rows);
    const expected = totals(claims);
    const before = await balances(protocol, options.node);
    const receipt = await protocol.rewards.claim(options.node, claims, { caller: options.caller });
    const after = await balances(protocol, options.node);
    const gas = receipt.gasUsed * receipt.gasPrice;
    assert.equal(after.rpl - before.rpl, expected.rpl);
    assert.equal(after.staked, before.staked);
    assertEthDeltas(before, after, expected, caller, gas);
}

export async function claimAndStakeRewardsAndAssert(
    protocol: RewardProtocol,
    options: {
        node: string;
        caller?: string;
        indices: bigint[];
        rows: RewardRow[][];
        stakeAmount: bigint;
    },
): Promise<void> {
    const nodeAddress = await protocol.nodes.address(options.node);
    const caller = await protocol.nodes.address(options.caller ?? options.node);
    const claims = rewardClaims(nodeAddress, options.indices, options.rows);
    const expected = totals(claims);
    const before = await balances(protocol, options.node);
    const receipt = await protocol.rewards.claimAndStake(
        options.node,
        claims,
        options.stakeAmount,
        { caller: options.caller },
    );
    const after = await balances(protocol, options.node);
    const gas = receipt.gasUsed * receipt.gasPrice;
    assert.equal(after.staked - before.staked, options.stakeAmount);
    assert.equal(after.rpl - before.rpl, expected.rpl - options.stakeAmount);
    assertEthDeltas(before, after, expected, caller, gas);
}
