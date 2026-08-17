import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolV131, ProtocolV14 } from "../../harness";
import { buildRewardTree, type RewardRow } from "./reward-tree";

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

export async function submitV0RewardsAndAssert(
    protocol: ProtocolV131,
    options: { index: bigint; rows: RewardRow[]; caller: string; treasuryRpl: bigint; userEth: bigint },
): Promise<void> {
    const tree = buildRewardTree(options.rows, 0);
    const aggregate = totals(options.rows);
    const submission = {
        rewardIndex: options.index,
        executionBlock: 0n,
        consensusBlock: 0n,
        merkleRoot: tree.root,
        merkleTreeCID: "0",
        intervalsPassed: 1n,
        treasuryRPL: options.treasuryRpl,
        trustedNodeRPL: aggregate.trustedNodeRpl,
        nodeRPL: aggregate.nodeRpl,
        nodeETH: aggregate.nodeEth,
        userETH: options.userEth,
    };
    const signer = await protocol.context.actor(options.caller);
    const caller = await signer.getAddress();
    const rewards = protocol.contracts.rocketRewardsPool;
    const [submittedBefore, countBefore, indexBefore, memberCount] = await Promise.all([
        rewards.getTrustedNodeSubmitted(caller, options.index),
        rewards.getSubmissionCount(submission),
        rewards.getRewardIndex(),
        protocol.contracts.rocketDAONodeTrusted.getMemberCount(),
    ]);
    assert.equal(submittedBefore, false);
    await (await rewards.connect(signer).submitRewardSnapshot(submission)).wait();
    const [submittedAfter, countAfter, indexAfter, exists] = await Promise.all([
        rewards.getTrustedNodeSubmitted(caller, options.index),
        rewards.getSubmissionCount(submission),
        rewards.getRewardIndex(),
        rewards.getSubmissionFromNodeExists(caller, submission),
    ]);
    assert.equal(submittedAfter, true);
    assert.equal(exists, true);
    assert.equal(countAfter, countBefore + 1n);
    assert.equal(indexAfter, countAfter * 2n > memberCount ? indexBefore + 1n : indexBefore);
}

export async function submitV1RewardsAndAssert(
    protocol: ProtocolV14,
    options: {
        index: bigint;
        rows: RewardRow[];
        caller: string;
        treasuryRpl: bigint;
        treasuryEth: bigint;
        userEth: bigint;
    },
): Promise<void> {
    const tree = buildRewardTree(options.rows, 1);
    const aggregate = totals(options.rows);
    const requiredEth = options.userEth + options.treasuryEth + aggregate.nodeEth.reduce((a, b) => a + b, 0n);
    const rewardsPoolEth = await protocol.contracts.rocketVault.balanceOf("rocketRewardsPool");
    const submission = {
        rewardIndex: options.index,
        executionBlock: 0n,
        consensusBlock: 0n,
        merkleRoot: tree.root,
        intervalsPassed: 1n,
        smoothingPoolETH: requiredEth > rewardsPoolEth ? requiredEth - rewardsPoolEth : 0n,
        treasuryRPL: options.treasuryRpl,
        treasuryETH: options.treasuryEth,
        userETH: options.userEth,
        trustedNodeRPL: aggregate.trustedNodeRpl,
        nodeRPL: aggregate.nodeRpl,
        nodeETH: aggregate.nodeEth,
    };
    const signer = await protocol.context.actor(options.caller);
    const caller = await signer.getAddress();
    const rewards = protocol.contracts.rocketRewardsPool;
    const [submittedBefore, countBefore, indexBefore, memberCount] = await Promise.all([
        rewards.getTrustedNodeSubmitted(caller, options.index),
        rewards.getSubmissionCount(submission),
        rewards.getRewardIndex(),
        protocol.contracts.rocketDAONodeTrusted.getMemberCount(),
    ]);
    assert.equal(submittedBefore, false);
    await (await rewards.connect(signer).submitRewardSnapshot(submission)).wait();
    const [submittedAfter, countAfter, indexAfter, exists] = await Promise.all([
        rewards.getTrustedNodeSubmitted(caller, options.index),
        rewards.getSubmissionCount(submission),
        rewards.getRewardIndex(),
        rewards.getSubmissionFromNodeExists(caller, submission),
    ]);
    assert.equal(submittedAfter, true);
    assert.equal(exists, true);
    assert.equal(countAfter, countBefore + 1n);
    assert.equal(indexAfter, countAfter * 2n > memberCount ? indexBefore + 1n : indexBefore);
}

export async function claimV0RewardsAndAssert(
    protocol: ProtocolV14,
    options: { node: string; indices: bigint[]; rows: RewardRow[][] },
): Promise<void> {
    const signer = await protocol.context.actor(options.node);
    const nodeAddress = await signer.getAddress();
    const withdrawal = await protocol.contracts.rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);
    const claims = options.indices.map((_, index) => {
        const claim = buildRewardTree(options.rows[index], 0).claims.get(ethers.getAddress(nodeAddress));
        if (!claim) throw new Error(`No v0 reward proof for ${nodeAddress}`);
        return claim;
    });
    const beforeRpl = await protocol.contracts.rocketTokenRPL.balanceOf(withdrawal);
    const beforeEth = BigInt(await ethers.provider.getBalance(withdrawal));
    const tx = await protocol.contracts.rocketMerkleDistributorMainnet.connect(signer).claim(
        nodeAddress,
        options.indices.map((rewardIndex, index) => ({
            rewardIndex,
            amountRPL: claims[index].amountRpl,
            amountSmoothingPoolETH: claims[index].amountNodeEth,
            amountVoterETH: 0n,
            merkleProof: claims[index].proof,
        })),
    );
    const receipt = await tx.wait();
    if (!receipt) throw new Error("v0 reward claim was not mined");
    const gas = receipt.gasUsed * receipt.gasPrice;
    assert.equal(
        await protocol.contracts.rocketTokenRPL.balanceOf(withdrawal) - beforeRpl,
        claims.reduce((sum, claim) => sum + claim.amountRpl, 0n),
    );
    assert.equal(
        BigInt(await ethers.provider.getBalance(withdrawal)) - beforeEth + BigInt(gas),
        claims.reduce((sum, claim) => sum + claim.amountNodeEth, 0n),
    );
}

export async function claimV1RewardsAndAssert(
    protocol: ProtocolV14,
    options: { node: string; indices: bigint[]; rows: RewardRow[][] },
): Promise<void> {
    const signer = await protocol.context.actor(options.node);
    const nodeAddress = await signer.getAddress();
    const withdrawal = await protocol.contracts.rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);
    const proofs = options.indices.map((_, index) => {
        const claim = buildRewardTree(options.rows[index], 1).claims.get(ethers.getAddress(nodeAddress));
        if (!claim) throw new Error(`No v1 reward proof for ${nodeAddress}`);
        return claim;
    });
    const beforeEth = BigInt(await ethers.provider.getBalance(withdrawal));
    const tx = await protocol.contracts.rocketMerkleDistributorMainnet.connect(signer).claim(
        nodeAddress,
        options.indices.map((rewardIndex, index) => ({
            rewardIndex,
            amountRPL: proofs[index].amountRpl,
            amountSmoothingPoolETH: proofs[index].amountNodeEth,
            amountVoterETH: proofs[index].amountVoterEth,
            merkleProof: proofs[index].proof,
        })),
    );
    const receipt = await tx.wait();
    if (!receipt) throw new Error("v1 reward claim was not mined");
    const gas = receipt.gasUsed * receipt.gasPrice;
    assert.equal(
        BigInt(await ethers.provider.getBalance(withdrawal)) - beforeEth + gas,
        proofs.reduce((sum, claim) => sum + claim.amountNodeEth + claim.amountVoterEth, 0n),
    );
}
