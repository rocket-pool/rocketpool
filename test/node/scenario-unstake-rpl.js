import {
    RocketNodeManager,
    RocketNodeStaking,
    RocketTokenRPL,
    RocketVault,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

// Unstake megapool RPL
export async function unstakeRpl(amount, txOptions) {
    // Load contracts
    const [
        rocketNodeManager,
        rocketNodeStaking,
        rocketTokenRPL,
        rocketVault,
    ] = await Promise.all([
        RocketNodeManager.deployed(),
        RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
        RocketVault.deployed(),
    ]);

    const nodeAddress = await rocketNodeManager.getNodeRPLWithdrawalAddress(txOptions.from.address);

    async function getData(){
        return Promise.all([
            rocketTokenRPL.balanceOf(nodeAddress),
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
    const tx = await rocketNodeStaking.connect(txOptions.from).unstakeRPL(amount, txOptions);
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

    // Unstaking does not change any RPL token balances
    assertBN.equal(deltas.nodeRpl, 0n);
    assertBN.equal(deltas.vaultRpl, 0n);
    assertBN.equal(deltas.stakingRpl, 0n);

    // Unstaking immediately reduces "staked" RPL balances
    assertBN.equal(deltas.totalStakedRpl, -amount);
    assertBN.equal(deltas.totalMegapoolRpl, -amount);
    assertBN.equal(deltas.totalLegacyRpl, 0n);
    assertBN.equal(deltas.nodeStakedRpl, -amount);
    assertBN.equal(deltas.nodeMegapoolRpl, -amount);
    assertBN.equal(deltas.nodeLegacyRpl, 0n);

    // Unstaking balance should increase
    assertBN.equal(deltas.nodeUnstakingRpl, amount);
}
