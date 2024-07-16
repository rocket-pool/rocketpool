import {
    RocketMerkleDistributorMainnet,
    RocketNodeManager, RocketNodeStaking,
    RocketRewardsPool,
    RocketStorage, RocketTokenRPL,
} from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';
import { assertBN } from '../_helpers/bn';


// Submit network prices
export async function claimAndStakeRewards(nodeAddress, indices, rewards, stakeAmount, txOptions) {

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
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketRewardsPool.getClaimIntervalTimeStart(),
            rocketTokenRPL.balanceOf.call(nodeWithdrawalAddress),
            rocketNodeStaking.getNodeRPLStake(nodeAddress),
            web3.eth.getBalance(nodeWithdrawalAddress),
            rocketMerkleDistributorMainnet.getOutstandingEth(nodeWithdrawalAddress),
        ]).then(
          ([claimIntervalTimeStart, nodeRpl, rplStake, nodeEth, outstandingEth]) =>
            ({claimIntervalTimeStart, nodeRpl, rplStake, nodeEth: web3.utils.toBN(nodeEth), outstandingEth: web3.utils.toBN(outstandingEth)})
        );
    }

    let [balances1] = await Promise.all([
        getBalances(),
    ]);

    // Construct claim arguments
    let claimer = nodeAddress;
    let claimerIndices = [];
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

        claimerIndices.push(proof.index);
        amountsRPL.push(proof.amountRPL);
        amountsETH.push(proof.amountETH);
        proofs.push(proof.proof);

        totalAmountRPL = totalAmountRPL.add(web3.utils.toBN(proof.amountRPL));
        totalAmountETH = totalAmountETH.add(web3.utils.toBN(proof.amountETH));
    }

    const tx = await rocketMerkleDistributorMainnet.claimAndStake(nodeAddress, indices, amountsRPL, amountsETH, proofs, stakeAmount, txOptions);
    let gasUsed = '0'.BN;

    if(nodeWithdrawalAddress.toLowerCase() === txOptions.from.toLowerCase()) {
        gasUsed = web3.utils.toBN(tx.receipt.gasUsed).mul(web3.utils.toBN(tx.receipt.effectiveGasPrice));
    }

    let [balances2] = await Promise.all([
        getBalances(),
    ]);

    let amountStaked = balances2.rplStake.sub(balances1.rplStake);

    assertBN.equal(balances2.nodeRpl.sub(balances1.nodeRpl), totalAmountRPL.sub(amountStaked), 'Incorrect updated node RPL balance');
    const ethDiff = balances2.nodeEth.sub(balances1.nodeEth).add(gasUsed).add(balances2.outstandingEth.sub(balances1.outstandingEth));
    assertBN.equal(ethDiff, totalAmountETH, 'Incorrect updated node ETH balance');
}
