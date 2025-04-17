import {
    RocketMerkleDistributorMainnet,
    RocketNodeManager, RocketNodeStaking,
    RocketRewardsPool,
    RocketTokenRPL,
} from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

// Submit network prices
export async function claimAndStakeRewards(nodeAddress, indices, rewards, stakeAmount, txOptions) {
    // Load contracts
    const [
        rocketRewardsPool,
        rocketNodeManager,
        rocketNodeStaking,
        rocketMerkleDistributorMainnet,
        rocketTokenRPL,
    ] = await Promise.all([
        RocketRewardsPool.deployed(),
        RocketNodeManager.deployed(),
        RocketNodeStaking.deployed(),
        RocketMerkleDistributorMainnet.deployed(),
        RocketTokenRPL.deployed(),
    ]);

    // Get node withdrawal address
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketRewardsPool.getClaimIntervalTimeStart(),
            rocketTokenRPL.balanceOf(nodeWithdrawalAddress),
            rocketNodeStaking.getNodeStakedRPL(nodeAddress),
            ethers.provider.getBalance(nodeWithdrawalAddress),
            rocketMerkleDistributorMainnet.getOutstandingEth(nodeWithdrawalAddress),
        ]).then(
          ([claimIntervalTimeStart, nodeRpl, rplStake, nodeEth, outstandingEth]) =>
            ({claimIntervalTimeStart, nodeRpl, rplStake, nodeEth, outstandingEth})
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
    let totalAmountRPL = 0n;
    let totalAmountETH = 0n;

    for (let i = 0; i < indices.length; i++) {
        let treeData = parseRewardsMap(rewards[i]);

        let proof = treeData.proof.claims[ethers.getAddress(claimer)];

        if (!proof) {
            throw new Error('No proof in merkle tree for ' + claimer)
        }

        claimerIndices.push(proof.index);
        amountsRPL.push(proof.amountRPL);
        amountsETH.push(proof.amountETH);
        proofs.push(proof.proof);

        totalAmountRPL = totalAmountRPL + proof.amountRPL;
        totalAmountETH = totalAmountETH + proof.amountETH;
    }

    const tx = await rocketMerkleDistributorMainnet.connect(txOptions.from).claimAndStake(nodeAddress, indices, amountsRPL, amountsETH, proofs, stakeAmount, txOptions);
    let gasUsed = 0n;

    if(nodeWithdrawalAddress.toLowerCase() === txOptions.from.address.toLowerCase()) {
        const txReceipt = await tx.wait();
        gasUsed = BigInt(txReceipt.gasUsed * txReceipt.gasPrice);
    }

    let [balances2] = await Promise.all([
        getBalances(),
    ]);

    let amountStaked = balances2.rplStake - balances1.rplStake;

    assertBN.equal(balances2.nodeRpl - balances1.nodeRpl, totalAmountRPL - amountStaked, 'Incorrect updated node RPL balance');
    const ethDiff = balances2.nodeEth - balances1.nodeEth + gasUsed + balances2.outstandingEth - balances1.outstandingEth;
    assertBN.equal(ethDiff, totalAmountETH, 'Incorrect updated node ETH balance');
}
