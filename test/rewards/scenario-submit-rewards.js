import {
    RocketClaimDAO,
    RocketDAONodeTrusted,
    RocketRewardsPool, RocketSmoothingPool,
    RocketTokenRETH,
    RocketTokenRPL, RocketVault,
} from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';
import { assertBN } from '../_helpers/bn';
import * as assert from 'assert';

const hre = require('hardhat');
const ethers = hre.ethers;

// Submit rewards
export async function submitRewards(index, rewards, treasuryRPL, userETH, treasuryETH, txOptions) {
    // Load contracts
    const [
        rocketDAONodeTrusted,
        rocketRewardsPool,
        rocketTokenRETH,
        rocketTokenRPL,
        rocketClaimDAO,
        rocketVault,
        rocketSmoothingPool,
    ] = await Promise.all([
        RocketDAONodeTrusted.deployed(),
        RocketRewardsPool.deployed(),
        RocketTokenRETH.deployed(),
        RocketTokenRPL.deployed(),
        RocketClaimDAO.deployed(),
        RocketVault.deployed(),
        RocketSmoothingPool.deployed(),
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

    const totalETHRequired = userETH + treasuryETH + nodeETH.reduce((a,b) => a + b, 0n);
    const smoothingPoolTotal = await ethers.provider.getBalance(rocketSmoothingPool.target)
    const rewardsPoolTotal = await rocketVault.balanceOf('rocketRewardsPool')

    if (totalETHRequired > smoothingPoolTotal + rewardsPoolTotal) {
        throw new Error('Not enough ETH in smoothing pool and rewards pool for rewards')
    }

    let smoothingPoolETH = 0

    if (totalETHRequired > rewardsPoolTotal) {
        smoothingPoolETH = totalETHRequired - rewardsPoolTotal
    }

    const root = treeData.proof.merkleRoot;

    const submission = {
        rewardIndex: index,
        executionBlock: 0n,
        consensusBlock: 0n,
        merkleRoot: root,
        intervalsPassed: 1n,
        smoothingPoolETH,

        treasuryRPL: treasuryRPL,
        treasuryETH: treasuryETH,

        userETH: userETH,

        trustedNodeRPL: trustedNodeRPL,
        nodeRPL: nodeRPL,
        nodeETH: nodeETH,
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

    async function getData() {
        let [submission, rewardIndex, treasuryRpl, treasuryEth, rethBalance, rewardsPoolBalance] = await Promise.all([
            getSubmissionDetails(),
            rocketRewardsPool.getRewardIndex(),
            rocketTokenRPL.balanceOf(rocketClaimDAO.target),
            rocketVault.balanceOf('rocketClaimDAO'),
            ethers.provider.getBalance(rocketTokenRETH.target),
            ethers.provider.getBalance(rocketRewardsPool.target),
        ]);
        return {submission, rewardIndex, treasuryRpl, treasuryEth, rethBalance, rewardsPoolBalance};
    }

    // Get initial submission details
    const data1 = await getData()

    let alreadyExecuted = submission.rewardIndex !== Number(data1.rewardIndex);
    // Submit prices
    await rocketRewardsPool.connect(txOptions.from).submitRewardSnapshot(submission, txOptions);
    const actualExecutionBlock = await ethers.provider.getBlockNumber();
    assert.equal(await rocketRewardsPool.getSubmissionFromNodeExists(txOptions.from.address, submission), true);

    // Get updated submission details & prices
    const data2 = await getData()

    // Check if prices should be updated and were not updated yet
    let expectedExecute = (data2.submission.count * 2n) > trustedNodeCount && !alreadyExecuted;
    // Check submission details
    assert.equal(data1.submission.nodeSubmitted, false, 'Incorrect initial node submitted status');
    assert.equal(data2.submission.nodeSubmitted, true, 'Incorrect updated node submitted status');
    assertBN.equal(data2.submission.count, data1.submission.count + 1n, 'Incorrect updated submission count');

    // Calculate changes in user ETH and treasury RPL
    let userETHChange = data2.rethBalance - data1.rethBalance;
    let treasuryRPLChange = data2.treasuryRpl - data1.treasuryRpl;
    let treasuryEthChange = data2.treasuryEth - data1.treasuryEth;

    // Check reward index and user balances
    if (expectedExecute) {
        assertBN.equal(data2.rewardIndex, data1.rewardIndex+ 1n, 'Incorrect updated network prices block');
        assertBN.equal(userETHChange, userETH, 'User ETH balance not correct');
        assertBN.equal(treasuryRPLChange, treasuryRPL, 'Treasury RPL balance not correct');
        assertBN.equal(treasuryEthChange, treasuryETH, 'Treasury ETH balance not correct');

        // Check block and address
        const executionBlock = await rocketRewardsPool.getClaimIntervalExecutionBlock(index);
        const executionAddress = await rocketRewardsPool.getClaimIntervalExecutionAddress(index);
        assert.equal(executionBlock, actualExecutionBlock);
        assert.equal(executionAddress, rocketRewardsPool.target);
    } else {
        assertBN.equal(data2.rewardIndex, data1.rewardIndex, 'Incorrect updated network prices block');
        assertBN.equal(data1.rethBalance, data2.rethBalance, 'User ETH balance changed');
        assertBN.equal(data1.treasuryRpl, data2.treasuryRpl, 'Treasury RPL balance changed');
        assertBN.equal(data1.treasuryEth, data2.treasuryEth, 'Treasury ETH balance changed');
    }

    // No left over ETH in the rewards pool
    assertBN.equal(data2.rewardsPoolBalance, 0n, 'ETH was left in the rewards pool');
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
    const treasuryETH = '0'.ether

    const submission = {
        rewardIndex: index,
        executionBlock: 0n,
        consensusBlock: 0n,
        merkleRoot: root,
        intervalsPassed: 1n,
        smoothingPoolETH: userETH + treasuryETH + nodeETH.reduce((a,b) => a + b, 0n),

        treasuryRPL: treasuryRPL,
        treasuryETH: treasuryETH,

        userETH: userETH,

        trustedNodeRPL: trustedNodeRPL,
        nodeRPL: nodeRPL,
        nodeETH: nodeETH,
    };

    // Submit prices
    let rewardIndex1 = await rocketRewardsPool.getRewardIndex();
    await rocketRewardsPool.connect(txOptions.from).executeRewardSnapshot(submission, txOptions);
    let rewardIndex2 = await rocketRewardsPool.getRewardIndex();

    // Check index incremented
    assertBN.equal(rewardIndex2, rewardIndex1 + 1n, 'Incorrect updated network prices block');
}
