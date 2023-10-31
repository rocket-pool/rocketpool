import {
    RocketClaimDAO,
    RocketDAONodeTrusted,
    RocketRewardsPool, RocketRewardsPoolNew,
    RocketTokenRETH, RocketTokenRPL,
} from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';
import { assertBN } from '../_helpers/bn';
import { upgradeExecuted } from '../_utils/upgrade';


// Submit rewards
export async function submitRewards(index, rewards, treasuryRPL, userETH, txOptions) {
    const upgraded = await upgradeExecuted();

    // Load contracts
    const [
        rocketDAONodeTrusted,
        rocketRewardsPool,
        rocketTokenRETH,
        rocketTokenRPL,
        rocketClaimDAO
    ] = await Promise.all([
        RocketDAONodeTrusted.deployed(),
        upgraded ? RocketRewardsPoolNew.deployed() : RocketRewardsPool.deployed(),
        RocketTokenRETH.deployed(),
        RocketTokenRPL.deployed(),
        RocketClaimDAO.deployed()
    ]);

    // Get parameters
    let trustedNodeCount = await rocketDAONodeTrusted.getMemberCount.call();

    // Construct the merkle tree
    let treeData = parseRewardsMap(rewards);

    const trustedNodeRPL = [];
    const nodeRPL = [];
    const nodeETH = [];

    let maxNetwork = rewards.reduce((a,b) => Math.max(a, b.network), 0);

    for(let i = 0; i <= maxNetwork; i++) {
        trustedNodeRPL[i] = '0'.BN
        nodeRPL[i] = '0'.BN
        nodeETH[i] = '0'.BN
    }

    for(let i = 0; i < rewards.length; i++) {
        trustedNodeRPL[rewards[i].network] = trustedNodeRPL[rewards[i].network].add(web3.utils.toBN(rewards[i].trustedNodeRPL))
        nodeRPL[rewards[i].network] = nodeRPL[rewards[i].network].add(web3.utils.toBN(rewards[i].nodeRPL))
        nodeETH[rewards[i].network] = nodeETH[rewards[i].network].add(web3.utils.toBN(rewards[i].nodeETH))
    }

    // web3 doesn't like an array of BigNumbers, have to convert to dec string
    for(let i = 0; i <= maxNetwork; i++) {
        trustedNodeRPL[i] = trustedNodeRPL[i].toString()
        nodeRPL[i] = nodeRPL[i].toString()
        nodeETH[i] = nodeETH[i].toString()
    }

    const root = treeData.proof.merkleRoot;
    const cid = '0';

    const submission = {
        rewardIndex: index,
        executionBlock: '0',
        consensusBlock: '0',
        merkleRoot: root,
        merkleTreeCID: cid,
        intervalsPassed: '1',
        treasuryRPL: treasuryRPL.toString(),
        trustedNodeRPL: trustedNodeRPL,
        nodeRPL: nodeRPL,
        nodeETH: nodeETH,
        userETH: userETH.toString()
    }

    // Get submission details
    function getSubmissionDetails() {
        return Promise.all([
            rocketRewardsPool.getTrustedNodeSubmitted(txOptions.from, index),
            rocketRewardsPool.getSubmissionCount(submission),
        ]).then(
            ([nodeSubmitted, count]) =>
            ({nodeSubmitted, count})
        );
    }

    // Get initial submission details
    let [submission1, rewardIndex1, treasuryRpl1, rethBalance1] = await Promise.all([
        getSubmissionDetails(),
        rocketRewardsPool.getRewardIndex(),
        rocketTokenRPL.balanceOf(rocketClaimDAO.address),
        web3.eth.getBalance(rocketTokenRETH.address)
    ]);

    let alreadyExecuted = submission.rewardIndex !== rewardIndex1.toNumber();
    // Submit prices
    await rocketRewardsPool.submitRewardSnapshot(submission, txOptions);
    const actualExecutionBlock = await web3.eth.getBlockNumber();
    assert.isTrue( await rocketRewardsPool.getSubmissionFromNodeExists(txOptions.from, submission));

    // Get updated submission details & prices
    let [submission2, rewardIndex2, treasuryRpl2, rethBalance2] = await Promise.all([
        getSubmissionDetails(),
        rocketRewardsPool.getRewardIndex(),
        rocketTokenRPL.balanceOf(rocketClaimDAO.address),
        web3.eth.getBalance(rocketTokenRETH.address)
    ]);

    // Check if prices should be updated and were not updated yet
    let expectedExecute = submission2.count.mul('2'.BN).gt(trustedNodeCount) && !alreadyExecuted;
    // Check submission details
    assert.isFalse(submission1.nodeSubmitted, 'Incorrect initial node submitted status');
    assert.isTrue(submission2.nodeSubmitted, 'Incorrect updated node submitted status');
    assertBN.equal(submission2.count, submission1.count.add('1'.BN), 'Incorrect updated submission count');

    // Calculate changes in user ETH and treasury RPL
    rethBalance1 = web3.utils.toBN(rethBalance1);
    rethBalance2 = web3.utils.toBN(rethBalance2);
    let userETHChange = rethBalance2.sub(rethBalance1);
    treasuryRpl1 = web3.utils.toBN(treasuryRpl1);
    treasuryRpl2 = web3.utils.toBN(treasuryRpl2);
    let treasuryRPLChange = treasuryRpl2.sub(treasuryRpl1);

    // Check reward index and user balances
    if (expectedExecute) {
        assertBN.equal(rewardIndex2, rewardIndex1.add('1'.BN), 'Incorrect updated network prices block');
        assertBN.equal(userETHChange, userETH, 'User ETH balance not correct');
        assertBN.equal(treasuryRPLChange, treasuryRPL, 'Treasury RPL balance not correct');

        // Check block and address
        const executionBlock = await rocketRewardsPool.getClaimIntervalExecutionBlock(index);
        const executionAddress = await rocketRewardsPool.getClaimIntervalExecutionAddress(index);
        assert.equal(executionBlock, actualExecutionBlock);
        assert.equal(executionAddress, rocketRewardsPool.address);
    } else {
        assertBN.equal(rewardIndex2, rewardIndex1, 'Incorrect updated network prices block');
        assertBN.equal(rethBalance1, rethBalance2, 'User ETH balance changed');
        assertBN.equal(treasuryRpl1, treasuryRpl2, 'Treasury RPL balance changed');
    }
}


// Execute a reward period that already has consensus
export async function executeRewards(index, rewards, treasuryRPL, userETH, txOptions) {
    const upgraded = await upgradeExecuted();

    // Load contracts
    const [
        rocketRewardsPool,
    ] = await Promise.all([
        upgraded ? RocketRewardsPoolNew.deployed() : RocketRewardsPool.deployed(),
    ]);

    // Construct the merkle tree
    let treeData = parseRewardsMap(rewards);

    const trustedNodeRPL = [];
    const nodeRPL = [];
    const nodeETH = [];
    treasuryRPL = web3.utils.toBN(treasuryRPL);
    userETH = web3.utils.toBN(userETH);

    let maxNetwork = rewards.reduce((a,b) => Math.max(a, b.network), 0);

    for(let i = 0; i <= maxNetwork; i++) {
        trustedNodeRPL[i] = '0'.BN
        nodeRPL[i] = '0'.BN
        nodeETH[i] = '0'.BN
    }

    for(let i = 0; i < rewards.length; i++) {
        trustedNodeRPL[rewards[i].network] = trustedNodeRPL[rewards[i].network].add(web3.utils.toBN(rewards[i].trustedNodeRPL))
        nodeRPL[rewards[i].network] = nodeRPL[rewards[i].network].add(web3.utils.toBN(rewards[i].nodeRPL))
        nodeETH[rewards[i].network] = nodeETH[rewards[i].network].add(web3.utils.toBN(rewards[i].nodeETH))
    }

    // web3 doesn't like an array of BigNumbers, have to convert to dec string
    for(let i = 0; i <= maxNetwork; i++) {
        trustedNodeRPL[i] = trustedNodeRPL[i].toString()
        nodeRPL[i] = nodeRPL[i].toString()
        nodeETH[i] = nodeETH[i].toString()
    }

    const root = treeData.proof.merkleRoot;
    const cid = '0';

    const submission = {
        rewardIndex: index,
        executionBlock: 0,
        consensusBlock: 0,
        merkleRoot: root,
        merkleTreeCID: cid,
        intervalsPassed: 1,
        treasuryRPL: treasuryRPL.toString(),
        trustedNodeRPL: trustedNodeRPL,
        nodeRPL: nodeRPL,
        nodeETH: nodeETH,
        userETH: userETH.toString()
    }

    // Submit prices
    let rewardIndex1 = await rocketRewardsPool.getRewardIndex();
    await rocketRewardsPool.executeRewardSnapshot(submission, txOptions);
    let rewardIndex2 = await rocketRewardsPool.getRewardIndex();

    // Check index incremented
    assertBN.equal(rewardIndex2, rewardIndex1.add('1'.BN), 'Incorrect updated network prices block');
}
