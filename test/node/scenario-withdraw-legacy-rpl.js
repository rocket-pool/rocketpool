import {
    RocketNodeStaking,
    RocketTokenRPL,
    RocketVault,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

// Withdraw legacy RPL
export async function withdrawLegacyRpl(amount, txOptions) {
    // Load contracts
    const [
        rocketNodeStaking,
        rocketTokenRPL,
        rocketVault,
    ] = await Promise.all([
        RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
        RocketVault.deployed(),
    ]);

    const nodeAddress = txOptions.from.address;

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
    await rocketNodeStaking.connect(txOptions.from).withdrawLegacyRPL(amount, txOptions);
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

    // Withdrawing legacy should transfer RPL from vault to node
    assertBN.equal(deltas.nodeRpl, amount);
    assertBN.equal(deltas.vaultRpl, -amount);
    assertBN.equal(deltas.stakingRpl, -amount);

    // Withdrawing legacy reduces total
    assertBN.equal(deltas.totalStakedRpl, -amount);
    assertBN.equal(deltas.totalLegacyRpl, -amount);
    assertBN.equal(deltas.nodeStakedRpl, -amount);
    assertBN.equal(deltas.nodeLegacyRpl, -amount);

    // No changes in megapool staked RPL
    assertBN.equal(deltas.nodeUnstakingRpl, 0n);
    assertBN.equal(deltas.totalMegapoolRpl, 0n);
    assertBN.equal(deltas.nodeMegapoolRpl, 0n);
}
