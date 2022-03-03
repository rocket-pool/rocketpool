import {
    RocketDAONodeTrusted,
    RocketMerkleDistributorMainnet,
    RocketNetworkPrices, RocketNodeManager, RocketNodeStaking,
    RocketRewardsPool,
    RocketStorage, RocketTokenRPL
} from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';


// Submit network prices
export async function claimAndStakeRewards(indices, rewards, stakeAmount, txOptions) {

    // Load contracts
    const [
        rocketRewardsPool,
        rocketNodeManager,
        rocketNodeStaking,
        rocketMerkleDistributorMainnet,
        rocketStorage,
        rocketTokenRPL,
    ] = await Promise.all([
        RocketRewardsPool.deployed(),
        RocketNodeManager.deployed(),
        RocketNodeStaking.deployed(),
        RocketMerkleDistributorMainnet.deployed(),
        RocketStorage.deployed(),
        RocketTokenRPL.deployed(),
    ]);

    // Get node withdrawal address
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(txOptions.from);

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketRewardsPool.getClaimIntervalTimeStart(),
            rocketTokenRPL.balanceOf.call(nodeWithdrawalAddress),
            rocketNodeStaking.getNodeRPLStake(txOptions.from)
        ]).then(
          ([claimIntervalTimeStart, nodeRpl, rplStake]) =>
            ({claimIntervalTimeStart, nodeRpl, rplStake})
        );
    }

    let [balances1] = await Promise.all([
        getBalances(),
    ]);

    // Construct claim arguments
    let claimer = txOptions.from;
    let claimerIndices = [];
    let amounts = [];
    let proofs = [];
    let totalAmount = web3.utils.toBN(0);

    for (let i = 0; i < indices.length; i++) {
        let treeData = parseRewardsMap(rewards[i]);

        let proof = treeData.proof.claims[web3.utils.toChecksumAddress(claimer)];

        if (!proof) {
            throw new Error('No proof in merkle tree for ' + claimer)
        }

        claimerIndices.push(proof.index);
        amounts.push(proof.amount);
        proofs.push(proof.proof);

        totalAmount = totalAmount.add(web3.utils.toBN(proof.amount));
    }

    await rocketMerkleDistributorMainnet.claimAndStake(indices, amounts, proofs, stakeAmount, txOptions);

    let [balances2] = await Promise.all([
        getBalances(),
    ]);

    let amountStaked = balances2.rplStake.sub(balances1.rplStake);

    assert(balances2.nodeRpl.sub(balances1.nodeRpl).eq(totalAmount.sub(amountStaked)), 'Incorrect updated node RPL balance');
    assert(amountStaked.eq(web3.utils.toBN(stakeAmount)), 'Incorrect amount staked')
}

