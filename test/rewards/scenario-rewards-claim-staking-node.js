import { RocketClaimNode, RocketNodeManager, RocketNodeStaking, RocketRewardsPool, RocketTokenRPL } from '../_utils/artifacts';

// Claim and stake rewards for a regular node
export async function rewardsClaimAndStakeNode(txOptions) {

    // Load contracts
    const [
        rocketClaimNode,
        rocketNodeManager,
        rocketNodeStaking,
        rocketRewardsPool,
        rocketTokenRPL,
    ] = await Promise.all([
        RocketClaimNode.deployed(),
        RocketNodeManager.deployed(),
        RocketNodeStaking.deployed(),
        RocketRewardsPool.deployed(),
        RocketTokenRPL.deployed(),
    ]);

    // Get node withdrawal address
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(txOptions.from);

    // Get details
    async function getDetails() {
        const [nodesRplShare, totalEffectiveRplStake, nodeEffectiveRplStake, nodeMaxRplStake] = await Promise.all([
            rocketRewardsPool.getClaimingContractAllowance.call('rocketClaimNode'),
            rocketNodeStaking.getTotalEffectiveRPLStake.call(),
            rocketNodeStaking.getNodeEffectiveRPLStake.call(txOptions.from),
            rocketNodeStaking.getNodeMaximumRPLStake.call(txOptions.from),
        ]);
        return ({ nodesRplShare, totalEffectiveRplStake, nodeEffectiveRplStake, nodeMaxRplStake });
    }

    // Get balances
    async function getBalances() {
        const [claimIntervalTimeStart, nodeRpl] = await Promise.all([
            rocketRewardsPool.getClaimIntervalTimeStart(),
            rocketTokenRPL.balanceOf.call(nodeWithdrawalAddress),
        ]);
        return ({ claimIntervalTimeStart, nodeRpl });
    }

    // Get initial details & balances
    let [details1, balances1] = await Promise.all([
        getDetails(),
        getBalances(),
    ]);

    // Claim rewards
    await rocketClaimNode.claimAndStake(txOptions);

    // Get updated balances
    let [details2, balances2] = await Promise.all([
        getDetails(),
        getBalances(),
    ]);

    // Calculate expected RPL claim amount
    let calcBase = web3.utils.toBN(web3.utils.toWei('1', 'ether'));
    let claimPerc = calcBase.mul(details2.nodeEffectiveRplStake).div(details2.totalEffectiveRplStake);
    let expectedClaimAmount = details2.nodesRplShare.mul(claimPerc).div(calcBase);

    if (details1.nodeEffectiveRplStake.add(expectedClaimAmount).lte(details2.nodeMaxRplStake)) {
        // Make sure the balance of the node hasn't changed (everything should have been staked)
        assert(balances1.nodeRpl.eq(balances2.nodeRpl), 'Incorrect updated node RPL balance');

        // Make sure the RPL stake has been updated by the claim amount
        assert(details2.nodeEffectiveRplStake.sub(details1.nodeEffectiveRplStake).eq(expectedClaimAmount), 'Incorrect updated node RPL stake');
    } else if (details1.nodeEffectiveRplStake.gte(details2.nodeMaxRplStake)) {
        // Make sure the entire claim amount has been withdrawn
        assert(balances2.nodeRpl.eq(balances1.nodeRpl.add(expectedClaimAmount)), 'Incorrect updated node RPL balance');

        // Make sure the RPL stake hasn't changed
        assert(details1.nodeEffectiveRplStake.eq(details2.nodeEffectiveRplStake), 'Incorrect updated effective stake');
    } else {
        // Case where some RPL can be staked, but some has to be withdrawn
        let expectedStakeAmount = details2.nodeMaxRplStake.sub(details1.nodeEffectiveRplStake);
        let expectedWithdrawalAmount = expectedClaimAmount.sub(expectedStakeAmount);

        // Make sure the balance has been updated by the right amount
        assert(balances2.nodeRpl.eq(balances1.nodeRpl.add(expectedWithdrawalAmount)), 'Incorrect updated node RPL balance');

        // Make sure the RPL stake has been updated by the right amount
        assert(details2.nodeEffectiveRplStake.eq(details1.nodeEffectiveRplStake.add(expectedStakeAmount)), 'Incorrect updated effective stake');

        // At this point, the effective stake should be equal to the max stake
        assert(details2.nodeEffectiveRplStake.eq(details2.nodeMaxRplStake), 'Incorrect updated effective stake');
    }
}
