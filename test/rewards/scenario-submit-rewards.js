import {
    RocketClaimDAO,
    RocketDAONodeTrusted,
    RocketRewardsPool,
    RocketTokenRETH,
    RocketTokenRPL,
} from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';
import { assertBN } from '../_helpers/bn';
import * as assert from 'assert';

const hre = require('hardhat');
const ethers = hre.ethers;

// Submit rewards
export async function submitRewards(index, rewards, treasuryRPL, userETH, txOptions) {
    // Load contracts
    const [
        rocketDAONodeTrusted,
        rocketRewardsPool,
        rocketTokenRETH,
        rocketTokenRPL,
        rocketClaimDAO,
    ] = await Promise.all([
        RocketDAONodeTrusted.deployed(),
        RocketRewardsPool.deployed(),
        RocketTokenRETH.deployed(),
        RocketTokenRPL.deployed(),
        RocketClaimDAO.deployed(),
    ]);

    // Get parameters
    let trustedNodeCount = await rocketDAONodeTrusted.getMemberCount();

    // Construct the merkle tree
    let treeData = parseRewardsMap(rewards);

    const trustedNodeRPL = [];
    const nodeRPL = [];
    const nodeETH = [];

    let maxNetwork = rewards.reduce((a, b) => Math.max(a, b.network), 0);

    for (let i = 0; i <= maxNetwork; i++) {
        trustedNodeRPL[i] = 0n;
        nodeRPL[i] = 0n;
        nodeETH[i] = 0n;
    }

    for (let i = 0; i < rewards.length; i++) {
        trustedNodeRPL[rewards[i].network] = trustedNodeRPL[rewards[i].network] + rewards[i].trustedNodeRPL;
        nodeRPL[rewards[i].network] = nodeRPL[rewards[i].network] + rewards[i].nodeRPL;
        nodeETH[rewards[i].network] = nodeETH[rewards[i].network] + rewards[i].nodeETH;
    }

    // // web3 doesn't like an array of BigNumbers, have to convert to dec string
    // for (let i = 0; i <= maxNetwork; i++) {
    //     trustedNodeRPL[i] = trustedNodeRPL[i].toString();
    //     nodeRPL[i] = nodeRPL[i].toString();
    //     nodeETH[i] = nodeETH[i].toString();
    // }

    const root = treeData.proof.merkleRoot;
    const cid = '0';

    const submission = {
        rewardIndex: index,
        executionBlock: '0',
        consensusBlock: '0',
        merkleRoot: root,
        merkleTreeCID: cid,
        intervalsPassed: '1',
        treasuryRPL: treasuryRPL,
        trustedNodeRPL: trustedNodeRPL,
        nodeRPL: nodeRPL,
        nodeETH: nodeETH,
        userETH: userETH,
    };

    // Get submission details
    function getSubmissionDetails() {
        return Promise.all([
            rocketRewardsPool.getTrustedNodeSubmitted(txOptions.from.address, index),
            rocketRewardsPool.getSubmissionCount(submission),
        ]).then(
            ([nodeSubmitted, count]) =>
                ({ nodeSubmitted, count }),
        );
    }

    // Get initial submission details
    let [submission1, rewardIndex1, treasuryRpl1, rethBalance1] = await Promise.all([
        getSubmissionDetails(),
        rocketRewardsPool.getRewardIndex(),
        rocketTokenRPL.balanceOf(rocketClaimDAO.target),
        ethers.provider.getBalance(rocketTokenRETH.target),
    ]);

    let alreadyExecuted = submission.rewardIndex !== Number(rewardIndex1);
    // Submit prices
    await rocketRewardsPool.connect(txOptions.from).submitRewardSnapshot(submission, txOptions);
    const actualExecutionBlock = await ethers.provider.getBlockNumber();
    assert.equal(await rocketRewardsPool.getSubmissionFromNodeExists(txOptions.from.address, submission), true);

    // Get updated submission details & prices
    let [submission2, rewardIndex2, treasuryRpl2, rethBalance2] = await Promise.all([
        getSubmissionDetails(),
        rocketRewardsPool.getRewardIndex(),
        rocketTokenRPL.balanceOf(rocketClaimDAO.target),
        ethers.provider.getBalance(rocketTokenRETH.target),
    ]);

    // Check if prices should be updated and were not updated yet
    let expectedExecute = (submission2.count * 2n) > trustedNodeCount && !alreadyExecuted;
    // Check submission details
    assert.equal(submission1.nodeSubmitted, false, 'Incorrect initial node submitted status');
    assert.equal(submission2.nodeSubmitted, true, 'Incorrect updated node submitted status');
    assertBN.equal(submission2.count, submission1.count + 1n, 'Incorrect updated submission count');

    // Calculate changes in user ETH and treasury RPL
    let userETHChange = rethBalance2 - rethBalance1;
    let treasuryRPLChange = treasuryRpl2 - treasuryRpl1;

    // Check reward index and user balances
    if (expectedExecute) {
        assertBN.equal(rewardIndex2, rewardIndex1 + 1n, 'Incorrect updated network prices block');
        assertBN.equal(userETHChange, userETH, 'User ETH balance not correct');
        assertBN.equal(treasuryRPLChange, treasuryRPL, 'Treasury RPL balance not correct');

        // Check block and address
        const executionBlock = await rocketRewardsPool.getClaimIntervalExecutionBlock(index);
        const executionAddress = await rocketRewardsPool.getClaimIntervalExecutionAddress(index);
        assert.equal(executionBlock, actualExecutionBlock);
        assert.equal(executionAddress, rocketRewardsPool.target);
    } else {
        assertBN.equal(rewardIndex2, rewardIndex1, 'Incorrect updated network prices block');
        assertBN.equal(rethBalance1, rethBalance2, 'User ETH balance changed');
        assertBN.equal(treasuryRpl1, treasuryRpl2, 'Treasury RPL balance changed');
    }
}

// Execute a reward period that already has consensus
export async function executeRewards(index, rewards, treasuryRPL, userETH, txOptions) {
    // Load contracts
    const [
        rocketRewardsPool,
    ] = await Promise.all([
        RocketRewardsPool.deployed(),
    ]);

    // Construct the merkle tree
    let treeData = parseRewardsMap(rewards);

    const trustedNodeRPL = [];
    const nodeRPL = [];
    const nodeETH = [];

    let maxNetwork = rewards.reduce((a, b) => Math.max(a, b.network), 0);

    for (let i = 0; i <= maxNetwork; i++) {
        trustedNodeRPL[i] = 0n;
        nodeRPL[i] = 0n;
        nodeETH[i] = 0n;
    }

    for (let i = 0; i < rewards.length; i++) {
        trustedNodeRPL[rewards[i].network] = trustedNodeRPL[rewards[i].network] + rewards[i].trustedNodeRPL;
        nodeRPL[rewards[i].network] = nodeRPL[rewards[i].network] + rewards[i].nodeRPL;
        nodeETH[rewards[i].network] = nodeETH[rewards[i].network] + rewards[i].nodeETH;
    }

    // // web3 doesn't like an array of BigNumbers, have to convert to dec string
    // for (let i = 0; i <= maxNetwork; i++) {
    //     trustedNodeRPL[i] = trustedNodeRPL[i].toString();
    //     nodeRPL[i] = nodeRPL[i].toString();
    //     nodeETH[i] = nodeETH[i].toString();
    // }

    const root = treeData.proof.merkleRoot;
    const cid = '0';

    const submission = {
        rewardIndex: index,
        executionBlock: 0,
        consensusBlock: 0,
        merkleRoot: root,
        merkleTreeCID: cid,
        intervalsPassed: 1,
        treasuryRPL: treasuryRPL,
        trustedNodeRPL: trustedNodeRPL,
        nodeRPL: nodeRPL,
        nodeETH: nodeETH,
        userETH: userETH,
    };

    // Submit prices
    let rewardIndex1 = await rocketRewardsPool.getRewardIndex();
    await rocketRewardsPool.connect(txOptions.from).executeRewardSnapshot(submission, txOptions);
    let rewardIndex2 = await rocketRewardsPool.getRewardIndex();

    // Check index incremented
    assertBN.equal(rewardIndex2, rewardIndex1 + 1n, 'Incorrect updated network prices block');
}
