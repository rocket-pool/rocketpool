import {
    RocketNodeManager,
    RocketNodeStaking,
    RocketTokenRPL,
    RocketVault,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

// Unstake legacy RPL for
export async function unstakeLegacyRpl(amount, txOptions) {
    return unstakeLegacyRplFor(amount, txOptions.from.address, txOptions.from)
}

// Unstake legacy RPL
export async function unstakeLegacyRplFor(amount, nodeAddress, from) {
    // Load contracts
    const [
        rocketNodeStaking,
        rocketTokenRPL,
        rocketVault,
        rocketNodeManager,
    ] = await Promise.all([
        RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
        RocketVault.deployed(),
        RocketNodeManager.deployed(),
    ]);

    const rplWithdrawalAddress = await rocketNodeManager.getNodeRPLWithdrawalAddress(nodeAddress);

    async function getData(){
        return Promise.all([
            rocketTokenRPL.balanceOf(rplWithdrawalAddress),
            rocketTokenRPL.balanceOf(rocketVault.target),
            rocketVault.balanceOfToken('rocketNodeStaking', rocketTokenRPL.target),
            rocketNodeStaking.getTotalStakedRPL(),
            rocketNodeStaking.getTotalMegapoolStakedRPL(),
            rocketNodeStaking.getTotalLegacyStakedRPL(),
            rocketNodeStaking.getNodeStakedRPL(nodeAddress),
            rocketNodeStaking.getNodeMegapoolStakedRPL(nodeAddress),
            rocketNodeStaking.getNodeLegacyStakedRPL(nodeAddress),
            rocketNodeStaking.getNodeLastUnstakeTime(nodeAddress),
            rocketNodeStaking.getNodeUnstakingRPL(nodeAddress),
        ]).then(
            ([nodeRpl, vaultRpl, stakingRpl, totalStakedRpl, totalMegapoolRpl, totalLegacyRpl, nodeStakedRpl, nodeMegapoolRpl, nodeLegacyRpl, nodeLastUnstakeTime, nodeUnstakingRpl ]) =>
                ({ nodeRpl, vaultRpl, stakingRpl, totalStakedRpl, totalMegapoolRpl, totalLegacyRpl, nodeStakedRpl, nodeMegapoolRpl, nodeLegacyRpl, nodeLastUnstakeTime, nodeUnstakingRpl }),
        );
    }

    const data1 = await getData();
    let tx
    if (from.address === nodeAddress) {
        tx = await rocketNodeStaking.connect(from).unstakeLegacyRPL(amount);
    } else {
        tx = await rocketNodeStaking.connect(from).unstakeLegacyRPLFor(nodeAddress, amount);
    }
    const block = await ethers.provider.getBlock(tx.blockNumber);
    const txTimestamp = block.timestamp;
    const data2 = await getData();

    const deltas = {
        nodeRpl: data2.nodeRpl - data1.nodeRpl,
        vaultRpl: data2.vaultRpl - data1.vaultRpl,
        stakingRpl: data2.stakingRpl - data1.stakingRpl,
        totalStakedRpl: data2.totalStakedRpl - data1.totalStakedRpl,
        totalMegapoolRpl: data2.totalMegapoolRpl- data1.totalMegapoolRpl,
        totalLegacyRpl: data2.totalLegacyRpl - data1.totalLegacyRpl,
        nodeStakedRpl: data2.nodeStakedRpl - data1.nodeStakedRpl,
        nodeMegapoolRpl: data2.nodeMegapoolRpl - data1.nodeMegapoolRpl,
        nodeLegacyRpl: data2.nodeLegacyRpl - data1.nodeLegacyRpl,
        nodeUnstakingRpl: data2.nodeUnstakingRpl - data1.nodeUnstakingRpl,
    }

    // Last unstake time should be set to transaction timestamp
    assertBN.equal(data2.nodeLastUnstakeTime, txTimestamp)

    // If last unstake was longer than 28 days ago, it should trigger a withdrawal
    let expectedWithdrawAmount = 0n
    if (txTimestamp - Number(data1.nodeLastUnstakeTime) > (60 * 60 * 24 * 28)) {
        expectedWithdrawAmount = data1.nodeUnstakingRpl
    }

    // Check RPL balances
    assertBN.equal(deltas.nodeRpl, expectedWithdrawAmount);
    assertBN.equal(deltas.vaultRpl, -expectedWithdrawAmount);
    assertBN.equal(deltas.stakingRpl, -expectedWithdrawAmount);

    // Unstaking immediately reduces "staked" RPL balances
    assertBN.equal(deltas.totalStakedRpl, -amount);
    assertBN.equal(deltas.totalMegapoolRpl, 0n);
    assertBN.equal(deltas.totalLegacyRpl, -amount);
    assertBN.equal(deltas.nodeStakedRpl, -amount);
    assertBN.equal(deltas.nodeMegapoolRpl, 0n);
    assertBN.equal(deltas.nodeLegacyRpl, -amount);

    // Unstaking balance should increase
    assertBN.equal(deltas.nodeUnstakingRpl, amount - expectedWithdrawAmount);
}
