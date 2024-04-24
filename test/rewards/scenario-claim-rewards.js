import {
    RocketMerkleDistributorMainnet,
    RocketNodeManagerNew,
    RocketRewardsPool,
    RocketStorage, RocketTokenRPL
} from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';
import { assertBN } from '../_helpers/bn';


// Submit network prices
export async function claimRewards(nodeAddress, indices, rewards, txOptions) {

    // Load contracts
    const [
        rocketRewardsPool,
        rocketNodeManager,
        rocketMerkleDistributorMainnet,
        rocketStorage,
        rocketTokenRPL,
    ] = await Promise.all([
        RocketRewardsPool.deployed(),
        RocketNodeManagerNew.deployed(),
        RocketMerkleDistributorMainnet.deployed(),
        RocketStorage.deployed(),
        RocketTokenRPL.deployed(),
    ]);

    // Get node withdrawal address
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);
    // Get node RPL withdrawal address
    let nodeRPLWithdrawalAddress = await rocketNodeManager.getNodeRPLWithdrawalAddress.call(nodeAddress);

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketRewardsPool.getClaimIntervalTimeStart(),
            rocketTokenRPL.balanceOf.call(nodeRPLWithdrawalAddress),
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
    let claimer = nodeAddress;
    let amountsRPL = [];
    let amountsETH = [];
    let proofs = [];
    let totalAmountRPL = '0'.BN;
    let totalAmountETH = '0'.BN;

    for (let i = 0; i < indices.length; i++) {
        let treeData = parseRewardsMap(rewards[i]);

        let proof = treeData.proof.claims[web3.utils.toChecksumAddress(claimer)];

        if (!proof) {
            throw new Error('No proof in merkle tree for ' + claimer)
        }

        amountsRPL.push(proof.amountRPL);
        amountsETH.push(proof.amountETH);
        proofs.push(proof.proof);

        totalAmountRPL = totalAmountRPL.add(proof.amountRPL.BN);
        totalAmountETH = totalAmountETH.add(proof.amountETH.BN);
    }

    const tx = await rocketMerkleDistributorMainnet.claim(nodeAddress, indices, amountsRPL, amountsETH, proofs, txOptions);
    let gasUsed = '0'.BN;

    if(nodeWithdrawalAddress.toLowerCase() === txOptions.from.toLowerCase()) {
        gasUsed = tx.receipt.gasUsed.BN.mul(tx.receipt.effectiveGasPrice.BN);
    }

    let [balances2] = await Promise.all([
        getBalances(),
    ]);

    assertBN.equal(balances2.nodeRpl.sub(balances1.nodeRpl), totalAmountRPL, 'Incorrect updated node RPL balance');
    assertBN.equal(balances2.nodeEth.sub(balances1.nodeEth).add(gasUsed), totalAmountETH, 'Incorrect updated node ETH balance');
}
