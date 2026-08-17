import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type {
    ProtocolCurrent,
    ProtocolV14,
    RewardSubmission,
} from "../../harness";
import { buildRewardTree, type RewardRow } from "./reward-tree";

type RewardProtocol = ProtocolV14 | ProtocolCurrent;

function totals(rows: RewardRow[]) {
    const maxNetwork = Math.max(...rows.map(row => row.network));
    const trustedNodeRpl = Array<bigint>(maxNetwork + 1).fill(0n);
    const nodeRpl = Array<bigint>(maxNetwork + 1).fill(0n);
    const nodeEth = Array<bigint>(maxNetwork + 1).fill(0n);
    for (const row of rows) {
        trustedNodeRpl[row.network] += row.trustedNodeRpl;
        nodeRpl[row.network] += row.nodeRpl;
        nodeEth[row.network] += row.nodeEth + (row.voterEth ?? 0n);
    }
    return { trustedNodeRpl, nodeRpl, nodeEth };
}

export async function rewardSubmission(
    protocol: RewardProtocol,
    options: {
        index: bigint;
        rows: RewardRow[];
        treasuryRpl?: bigint;
        treasuryEth?: bigint;
        userEth?: bigint;
    },
): Promise<RewardSubmission> {
    const aggregate = totals(options.rows);
    const treasuryEth = options.treasuryEth ?? 0n;
    const userEth = options.userEth ?? 0n;
    const requiredEth = treasuryEth + userEth + aggregate.nodeEth.reduce((a, b) => a + b, 0n);
    const rewardsPoolEth = await protocol.contracts.rocketVault.balanceOf("rocketRewardsPool");
    return {
        rewardIndex: options.index,
        executionBlock: 0n,
        consensusBlock: 0n,
        merkleRoot: buildRewardTree(options.rows, 1).root,
        intervalsPassed: 1n,
        smoothingPoolETH: requiredEth > rewardsPoolEth ? requiredEth - rewardsPoolEth : 0n,
        treasuryRPL: options.treasuryRpl ?? 0n,
        treasuryETH: treasuryEth,
        userETH: userEth,
        trustedNodeRPL: aggregate.trustedNodeRpl,
        nodeRPL: aggregate.nodeRpl,
        nodeETH: aggregate.nodeEth,
    };
}

export async function submitRewardsAndAssert(
    protocol: RewardProtocol,
    options: {
        index: bigint;
        rows: RewardRow[];
        caller: string;
        treasuryRpl?: bigint;
        treasuryEth?: bigint;
        userEth?: bigint;
    },
): Promise<RewardSubmission> {
    const submission = await rewardSubmission(protocol, options);
    const rewardsPool = protocol.contracts.rocketRewardsPool;
    const token = protocol.contracts.rocketTokenRPL;
    const claimDaoAddress = await protocol.contracts.rocketClaimDAO.getAddress();
    const rewardsPoolAddress = await rewardsPool.getAddress();
    const [submittedBefore, countBefore, indexBefore, memberCount, treasuryRplBefore,
        treasuryEthBefore, rethEthBefore] = await Promise.all([
        protocol.rewards.submitted(options.caller, options.index),
        protocol.rewards.submissionCount(submission),
        protocol.rewards.rewardIndex(),
        protocol.odao.members.count(),
        token.balanceOf(claimDaoAddress),
        protocol.contracts.rocketVault.balanceOf("rocketClaimDAO"),
        ethers.provider.getBalance(await protocol.contracts.rocketTokenRETH.getAddress()),
    ]);
    assert.equal(submittedBefore, false);

    const receipt = await protocol.rewards.submit(submission, { caller: options.caller });
    const [submittedAfter, exists, countAfter, indexAfter, treasuryRplAfter,
        treasuryEthAfter, rethEthAfter, rewardsPoolEthAfter] = await Promise.all([
        protocol.rewards.submitted(options.caller, options.index),
        protocol.rewards.submissionExists(options.caller, submission),
        protocol.rewards.submissionCount(submission),
        protocol.rewards.rewardIndex(),
        token.balanceOf(claimDaoAddress),
        protocol.contracts.rocketVault.balanceOf("rocketClaimDAO"),
        ethers.provider.getBalance(await protocol.contracts.rocketTokenRETH.getAddress()),
        ethers.provider.getBalance(rewardsPoolAddress),
    ]);
    assert.equal(submittedAfter, true);
    assert.equal(exists, true);
    assert.equal(countAfter, countBefore + 1n);

    const executed = submission.rewardIndex === indexBefore && countAfter * 2n > memberCount;
    assert.equal(indexAfter, executed ? indexBefore + 1n : indexBefore);
    if (executed) {
        assert.equal(treasuryRplAfter - treasuryRplBefore, submission.treasuryRPL);
        assert.equal(treasuryEthAfter - treasuryEthBefore, submission.treasuryETH);
        assert.equal(rethEthAfter - rethEthBefore, submission.userETH);
        assert.deepEqual(await protocol.rewards.execution(options.index), {
            block: BigInt(receipt.blockNumber),
            address: rewardsPoolAddress,
        });
    } else {
        assert.equal(treasuryRplAfter, treasuryRplBefore);
        assert.equal(treasuryEthAfter, treasuryEthBefore);
        assert.equal(rethEthAfter, rethEthBefore);
    }
    assert.equal(rewardsPoolEthAfter, 0n, "ETH was left in the rewards pool");
    return submission;
}

export async function executeRewardsAndAssert(
    protocol: RewardProtocol,
    submission: RewardSubmission,
    options: { caller: string },
): Promise<void> {
    const indexBefore = await protocol.rewards.rewardIndex();
    const receipt = await protocol.rewards.execute(submission, options);
    assert.equal(await protocol.rewards.rewardIndex(), indexBefore + 1n);
    assert.deepEqual(await protocol.rewards.execution(submission.rewardIndex), {
        block: BigInt(receipt.blockNumber),
        address: await protocol.contracts.rocketRewardsPool.getAddress(),
    });
}
