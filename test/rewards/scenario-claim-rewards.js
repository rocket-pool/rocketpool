import {
    RocketDAONodeTrusted,
    RocketMerkleDistributorMainnet,
    RocketNetworkPrices, RocketNodeManager,
    RocketRewardsPool,
    RocketStorage, RocketTokenRPL
} from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';


// Submit network prices
export async function claimRewards(indices, rewards, txOptions) {

    // Load contracts
    const [
        rocketRewardsPool,
        rocketNodeManager,
        rocketMerkleDistributorMainnet,
        rocketStorage,
        rocketTokenRPL,
    ] = await Promise.all([
        RocketRewardsPool.deployed(),
        RocketNodeManager.deployed(),
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
        ]).then(
          ([claimIntervalTimeStart, nodeRpl]) =>
            ({claimIntervalTimeStart, nodeRpl})
        );
    }

    let [balances1] = await Promise.all([
        getBalances(),
    ]);

    // Construct claim arguments
    let claimer = txOptions.from;
    let amounts = [];
    let proofs = [];
    let totalAmount = web3.utils.toBN(0);

    for (let i = 0; i < indices.length; i++) {
        let treeData = parseRewardsMap(rewards[i]);

        let proof = treeData.proof.claims[web3.utils.toChecksumAddress(claimer)];

        if (!proof) {
            throw new Error('No proof in merkle tree for ' + claimer)
        }

        amounts.push(proof.amount);
        proofs.push(proof.proof);

        totalAmount = totalAmount.add(web3.utils.toBN(proof.amount));
    }

    await rocketMerkleDistributorMainnet.claim(indices, amounts, proofs, txOptions);

    let [balances2] = await Promise.all([
        getBalances(),
    ]);

    assert(balances2.nodeRpl.sub(balances1.nodeRpl).eq(totalAmount), 'Incorrect updated node RPL balance');
}

