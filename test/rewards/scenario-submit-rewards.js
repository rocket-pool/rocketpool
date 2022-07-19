import { RocketDAONodeTrusted, RocketNetworkPrices, RocketRewardsPool, RocketStorage } from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';


// Submit rewards
export async function submitRewards(index, rewards, treasuryRPL, txOptions) {

    // Load contracts
    const [
        rocketDAONodeTrusted,
        rocketRewardsPool,
        rocketStorage,
    ] = await Promise.all([
        RocketDAONodeTrusted.deployed(),
        RocketRewardsPool.deployed(),
        RocketStorage.deployed(),
    ]);

    // Get parameters
    let trustedNodeCount = await rocketDAONodeTrusted.getMemberCount.call();

    // Construct the merkle tree
    let treeData = parseRewardsMap(rewards);

    const totalRPL = treeData.proof.totalRewardsRPL;
    const totalETH = treeData.proof.totalRewardsETH;
    const trustedNodeRPL = [];
    const nodeRPL = [];
    const nodeETH = [];

    let maxNetwork = rewards.reduce((a,b) => Math.max(a, b.network), 0);

    for(let i = 0; i <= maxNetwork; i++) {
        trustedNodeRPL[i] = web3.utils.toBN('0')
        nodeRPL[i] = web3.utils.toBN('0')
        nodeETH[i] = web3.utils.toBN('0')
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
        treasuryRPL: treasuryRPL,
        trustedNodeRPL: trustedNodeRPL,
        nodeRPL: nodeRPL,
        nodeETH: nodeETH
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
    let [submission1, rewardIndex1] = await Promise.all([
        getSubmissionDetails(),
        rocketRewardsPool.getRewardIndex()
    ]);


    // Submit prices
    await rocketRewardsPool.submitRewardSnapshot(submission, txOptions);

    // Get updated submission details & prices
    let [submission2, rewardIndex2] = await Promise.all([
        getSubmissionDetails(),
        rocketRewardsPool.getRewardIndex()
    ]);

    // Check if prices should be updated
    let expectUpdatedPrices = submission2.count.mul(web3.utils.toBN(2)).gt(trustedNodeCount);

    // Check submission details
    assert.isFalse(submission1.nodeSubmitted, 'Incorrect initial node submitted status');
    assert.isTrue(submission2.nodeSubmitted, 'Incorrect updated node submitted status');
    assert(submission2.count.eq(submission1.count.add(web3.utils.toBN(1))), 'Incorrect updated submission count');

    // Check prices
    if (expectUpdatedPrices) {
        assert(rewardIndex2.eq(rewardIndex1.add(web3.utils.toBN(1))), 'Incorrect updated network prices block');
    } else {
        assert(rewardIndex2.eq(rewardIndex1), 'Incorrect updated network prices block');
    }

}

// Execute a reward period that already has consensus
export async function executeRewards(index, rewards, treasuryRPL, txOptions) {

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

    let maxNetwork = rewards.reduce((a,b) => Math.max(a, b.network), 0);

    for(let i = 0; i <= maxNetwork; i++) {
        trustedNodeRPL[i] = web3.utils.toBN('0')
        nodeRPL[i] = web3.utils.toBN('0')
        nodeETH[i] = web3.utils.toBN('0')
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
        treasuryRPL: treasuryRPL,
        trustedNodeRPL: trustedNodeRPL,
        nodeRPL: nodeRPL,
        nodeETH: nodeETH
    }

    // Submit prices
    let rewardIndex1 = await rocketRewardsPool.getRewardIndex();
    await rocketRewardsPool.executeRewardSnapshot(submission, txOptions);
    let rewardIndex2 = await rocketRewardsPool.getRewardIndex();

    // Check index incremented
    assert(rewardIndex2.eq(rewardIndex1.add(web3.utils.toBN(1))), 'Incorrect updated network prices block');
}

