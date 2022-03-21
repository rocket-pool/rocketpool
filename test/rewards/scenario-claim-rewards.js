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
            web3.eth.getBalance(nodeWithdrawalAddress)
        ]).then(
          ([claimIntervalTimeStart, nodeRpl, nodeEth]) =>
            ({claimIntervalTimeStart, nodeRpl, nodeEth: web3.utils.toBN(nodeEth)})
        );
    }

    let [balances1] = await Promise.all([
        getBalances(),
    ]);

    // Construct claim arguments
    let claimer = txOptions.from;
    let amountsRPL = [];
    let amountsETH = [];
    let proofs = [];
    let totalAmountRPL = web3.utils.toBN(0);
    let totalAmountETH = web3.utils.toBN(0);

    for (let i = 0; i < indices.length; i++) {
        let treeData = parseRewardsMap(rewards[i]);

        let proof = treeData.proof.claims[web3.utils.toChecksumAddress(claimer)];

        if (!proof) {
            throw new Error('No proof in merkle tree for ' + claimer)
        }

        amountsRPL.push(proof.amountRPL);
        amountsETH.push(proof.amountETH);
        proofs.push(proof.proof);

        totalAmountRPL = totalAmountRPL.add(web3.utils.toBN(proof.amountRPL));
        totalAmountETH = totalAmountETH.add(web3.utils.toBN(proof.amountETH));
    }

    const tx = await rocketMerkleDistributorMainnet.claim(indices, amountsRPL, amountsETH, proofs, txOptions);
    let gasUsed = web3.utils.toBN('0');

    if(nodeWithdrawalAddress.toLowerCase() === txOptions.from.toLowerCase()) {
        gasUsed = web3.utils.toBN(tx.receipt.gasUsed).mul(web3.utils.toBN(tx.receipt.effectiveGasPrice));
    }

    let [balances2] = await Promise.all([
        getBalances(),
    ]);

    assert(balances2.nodeRpl.sub(balances1.nodeRpl).eq(totalAmountRPL), 'Incorrect updated node RPL balance');
    assert(balances2.nodeEth.sub(balances1.nodeEth).add(gasUsed).eq(totalAmountETH), 'Incorrect updated node ETH balance');
}

