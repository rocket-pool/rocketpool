import { RocketDAONodeTrusted, RocketNetworkPrices, RocketRewardsPool, RocketStorage } from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';


// Submit network prices
export async function submitRewards(index, rewards, txOptions) {

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
    const perNetworkRPL = [];
    const perNetworkETH = [];

    let maxNetwork = Object.keys(treeData.proof.rewardsPerNetworkRPL).reduce((a,b) => Math.max(Number(a), Number(b)), 0)

    for(let i = 0; i <= maxNetwork; i++) {
        if (i in treeData.proof.rewardsPerNetworkRPL){
            perNetworkRPL.push(treeData.proof.rewardsPerNetworkRPL[i]);
        } else {
            perNetworkRPL.push('0');
        }
        if (i in treeData.proof.rewardsPerNetworkETH){
            perNetworkETH.push(treeData.proof.rewardsPerNetworkETH[i]);
        } else {
            perNetworkETH.push('0');
        }
    }

    const root = treeData.proof.merkleRoot;
    const cid = '0';

    // Get submission keys
    let nodeSubmissionKey = web3.utils.soliditySha3(
      {t: 'string', v: 'rewards.snapshot.submitted.node'},
      {t: 'address', v: txOptions.from},
      {t: 'uint256', v: index},
      {t: 'uint256', v: 0},
      {t: 'uint256', v: totalRPL},
      {t: 'uint256', v: totalETH},
      {t: 'bytes32', v: root},
      {t: 'string', v: cid}
    );
    let submissionCountKey = web3.utils.soliditySha3(
      {t: 'string', v: 'rewards.snapshot.submitted.count'},
      {t: 'uint256', v: index},
      {t: 'uint256', v: 0},
      {t: 'uint256', v: totalRPL},
      {t: 'uint256', v: totalETH},
      {t: 'bytes32', v: root},
      {t: 'string', v: cid}
    );

    // Get submission details
    function getSubmissionDetails() {
        return Promise.all([
            rocketStorage.getBool.call(nodeSubmissionKey),
            rocketStorage.getUint.call(submissionCountKey),
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
    await rocketRewardsPool.submitRewardSnapshot(index, 0, perNetworkRPL, perNetworkETH, root, cid, txOptions);

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

