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

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketRewardsPool.getClaimIntervalTimeStart(),
            rocketTokenRPL.balanceOf(nodeWithdrawalAddress),
            ethers.provider.getBalance(nodeWithdrawalAddress),
        ]).then(
            ([claimIntervalTimeStart, nodeRpl, nodeEth]) =>
                ({ claimIntervalTimeStart, nodeRpl, nodeEth }),
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
    let totalAmountRPL = 0n;
    let totalAmountETH = 0n;

    for (let i = 0; i < indices.length; i++) {
        let treeData = parseRewardsMap(rewards[i]);

        let proof = treeData.proof.claims[ethers.getAddress(claimer)];

        if (!proof) {
            throw new Error('No proof in merkle tree for ' + claimer);
        }

        amountsRPL.push(proof.amountRPL);
        amountsETH.push(proof.amountETH);
        proofs.push(proof.proof);

        totalAmountRPL = totalAmountRPL + proof.amountRPL;
        totalAmountETH = totalAmountETH + proof.amountETH;
    }

    const tx = await rocketMerkleDistributorMainnet.connect(txOptions.from).claim(nodeAddress, indices, amountsRPL, amountsETH, proofs, txOptions);
    let gasUsed = 0n;

    if (ethers.getAddress(nodeWithdrawalAddress) === ethers.getAddress(txOptions.from.address)) {
        const txReceipt = await tx.wait();
        gasUsed = BigInt(txReceipt.gasUsed * txReceipt.gasPrice);
    }

    let [balances2] = await Promise.all([
        getBalances(),
    ]);

    assertBN.equal(balances2.nodeRpl - balances1.nodeRpl, totalAmountRPL, 'Incorrect updated node RPL balance');
    assertBN.equal(balances2.nodeEth - balances1.nodeEth + gasUsed, totalAmountETH, 'Incorrect updated node ETH balance');
}
