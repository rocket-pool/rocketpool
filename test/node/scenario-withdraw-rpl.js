import {
    RocketNodeManager,
    RocketNodeStaking,
    RocketTokenRPL,
    RocketVault,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

export async function withdrawRpl(txOptions) {
    return withdrawRplFor(txOptions.from.address, txOptions.from)
}

// Withdraw unstaking megapool RPL
export async function withdrawRplFor(nodeAddress, from) {
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
    if (from.address === nodeAddress) {
        await rocketNodeStaking.connect(from).withdrawRPL();
    } else {
        await rocketNodeStaking.connect(from).withdrawRPLFor(nodeAddress);
    }
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
    }

    // Withdrawing should transfer RPL from vault to node
    const amount = data1.nodeUnstakingRpl
    assertBN.equal(data2.nodeUnstakingRpl, 0n);
    assertBN.equal(deltas.nodeRpl, amount);
    assertBN.equal(deltas.vaultRpl, -amount);
    assertBN.equal(deltas.stakingRpl, -amount);

    // Withdrawing has no affect on staking balances
    assertBN.equal(deltas.totalStakedRpl, 0n);
    assertBN.equal(deltas.totalMegapoolRpl, 0n);
    assertBN.equal(deltas.totalLegacyRpl, 0n);
    assertBN.equal(deltas.nodeStakedRpl, 0n);
    assertBN.equal(deltas.nodeMegapoolRpl, 0n);
    assertBN.equal(deltas.nodeLegacyRpl, 0n);
}
