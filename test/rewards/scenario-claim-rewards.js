import {
    RocketMerkleDistributorMainnet,
    RocketNodeManager,
    RocketRewardsPool,
    RocketTokenRPL,
} from '../_utils/artifacts';
import { parseRewardsMap } from '../_utils/merkle-tree';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

// Submit network prices
export async function claimRewards(nodeAddress, indices, rewards, txOptions) {

    // Load contracts
    const [
        rocketRewardsPool,
        rocketNodeManager,
        rocketMerkleDistributorMainnet,
        rocketTokenRPL,
    ] = await Promise.all([
        RocketRewardsPool.deployed(),
        RocketNodeManager.deployed(),
        RocketMerkleDistributorMainnet.deployed(),
        RocketTokenRPL.deployed(),
    ]);

    // Get node withdrawal address
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);
    let nodeRPLWithdrawalAddress = await rocketNodeManager.getNodeRPLWithdrawalAddress(nodeAddress);

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketRewardsPool.getClaimIntervalTimeStart(),
            rocketTokenRPL.balanceOf(nodeWithdrawalAddress),
            ethers.provider.getBalance(nodeWithdrawalAddress),
            ethers.provider.getBalance(nodeRPLWithdrawalAddress),
        ]).then(
            ([claimIntervalTimeStart, nodeRpl, nodeEth, nodeRplEth]) =>
                ({ claimIntervalTimeStart, nodeRpl, nodeEth, nodeRplEth }),
        );
    }

    let [balances1] = await Promise.all([
        getBalances(),
    ]);

    // Construct claim arguments
    let claimer = nodeAddress;
    let totalAmountRPL = 0n;
    let totalAmountETH = 0n;
    let totalAmountVoterETH = 0n;

    let claims = []

    for (let i = 0; i < indices.length; i++) {
        let treeData = parseRewardsMap(rewards[i]);

        let proof = treeData.proof.claims[ethers.getAddress(claimer)];

        if (!proof) {
            throw new Error('No proof in merkle tree for ' + claimer)
        }

        claims.push({
            rewardIndex: indices[i],
            amountRPL: proof.amountRPL,
            amountSmoothingPoolETH: proof.amountSmoothingPoolETH,
            amountVoterETH: proof.amountVoterETH,
            merkleProof: proof.proof
        })

        totalAmountRPL = totalAmountRPL + proof.amountRPL;
        totalAmountETH = totalAmountETH + proof.amountSmoothingPoolETH;
        totalAmountVoterETH = totalAmountVoterETH + proof.amountVoterETH;
    }

    const tx = await rocketMerkleDistributorMainnet.connect(txOptions.from).claim(nodeAddress, claims, txOptions);
    let gasUsed = 0n;

    if (ethers.getAddress(nodeWithdrawalAddress) === ethers.getAddress(txOptions.from.address)) {
        const txReceipt = await tx.wait();
        gasUsed = BigInt(txReceipt.gasUsed * txReceipt.gasPrice);
    }

    let [balances2] = await Promise.all([
        getBalances(),
    ]);

    assertBN.equal(balances2.nodeRpl - balances1.nodeRpl, totalAmountRPL, 'Incorrect updated node RPL balance');

    if (nodeRPLWithdrawalAddress === nodeWithdrawalAddress) {
        assertBN.equal(balances2.nodeEth - balances1.nodeEth + gasUsed, totalAmountETH + totalAmountVoterETH, 'Incorrect updated node ETH balance');
    } else {
        assertBN.equal(balances2.nodeEth - balances1.nodeEth + gasUsed, totalAmountETH, 'Incorrect updated node ETH balance');
        assertBN.equal(balances2.nodeRplEth - balances1.nodeRplEth, totalAmountVoterETH, 'Incorrect updated node voter ETH balance');
    }
}
