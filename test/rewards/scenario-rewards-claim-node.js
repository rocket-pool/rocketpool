import { RocketClaimNode, RocketNodeManager, RocketNodeStaking, RocketRewardsPool, RocketTokenRPL } from '../_utils/artifacts';


// Perform rewards claims for a regular node
export async function rewardsClaimNode(txOptions) {

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
    function getDetails() {
        return Promise.all([
            rocketRewardsPool.getClaimingContractAllowance.call('rocketClaimNode'),
            rocketNodeStaking.getTotalEffectiveRPLStake.call(),
            rocketNodeStaking.getNodeEffectiveRPLStake.call(txOptions.from),
        ]).then(
            ([nodesRplShare, totalRplStake, nodeRplStake]) =>
            ({nodesRplShare, totalRplStake, nodeRplStake})
        );
    }

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketRewardsPool.getClaimIntervalBlockStart(),
            rocketTokenRPL.balanceOf.call(nodeWithdrawalAddress),
        ]).then(
            ([claimIntervalBlockStart, nodeRpl]) =>
            ({claimIntervalBlockStart, nodeRpl})
        );
    }

    // Get initial details & balances
    let [details1, balances1] = await Promise.all([
        getDetails(),
        getBalances(),
    ]);

    // Claim rewards
    await rocketClaimNode.claim(txOptions);

    // Get updated balances
    let [details2, balances2] = await Promise.all([
        getDetails(),
        getBalances(),
    ]);

    // Calculate expected RPL claim amount
    let calcBase = web3.utils.toBN(web3.utils.toWei('1', 'ether'));
    let claimPerc = calcBase.mul(details2.nodeRplStake).div(details2.totalRplStake);
    let expectedClaimAmount = details2.nodesRplShare.mul(claimPerc).div(calcBase);

    // console.log(Number(balances1.claimIntervalBlockStart), Number(balances2.claimIntervalBlockStart));
    // console.log(web3.utils.fromWei(balances2.nodeRpl.sub(balances1.nodeRpl)), web3.utils.fromWei(expectedClaimAmount));

    // Check balances
    assert(balances2.nodeRpl.sub(balances1.nodeRpl).eq(expectedClaimAmount), 'Incorrect updated node RPL balance');

}

