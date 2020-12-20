import { RocketMinipoolSettings, RocketNetworkPrices, RocketNodeSettings, RocketNodeStaking, RocketTokenRPL, RocketVault } from '../_utils/artifacts';


// Withdraw RPL staked against the node
export async function withdrawRpl(amount, txOptions) {

    // Load contracts
    const [
        rocketMinipoolSettings,
        rocketNetworkPrices,
        rocketNodeSettings,
        rocketNodeStaking,
        rocketTokenRPL,
        rocketVault,
    ] = await Promise.all([
        RocketMinipoolSettings.deployed(),
        RocketNetworkPrices.deployed(),
        RocketNodeSettings.deployed(),
        RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
        RocketVault.deployed(),
    ]);

    // Get parameters
    const [
        depositUserAmount,
        minPerMinipoolStake,
        rplPrice,
    ] = await Promise.all([
        rocketMinipoolSettings.getHalfDepositUserAmount.call(),
        rocketNodeSettings.getMinimumPerMinipoolStake.call(),
        rocketNetworkPrices.getRPLPrice.call(),
    ]);

    // Get token balances
    function getTokenBalances(nodeAddress) {
        return Promise.all([
            rocketTokenRPL.balanceOf.call(nodeAddress),
            rocketTokenRPL.balanceOf.call(rocketVault.address),
            rocketVault.balanceOfToken.call('rocketNodeStaking', rocketTokenRPL.address),
        ]).then(
            ([nodeRpl, vaultRpl, stakingRpl]) =>
            ({nodeRpl, vaultRpl, stakingRpl})
        );
    }

    // Get staking details
    function getStakingDetails(nodeAddress) {
        return Promise.all([
            rocketNodeStaking.getTotalRPLStake.call(),
            rocketNodeStaking.getTotalEffectiveRPLStake.call(),
            rocketNodeStaking.getNodeRPLStake.call(nodeAddress),
            rocketNodeStaking.getNodeEffectiveRPLStake.call(nodeAddress),
            rocketNodeStaking.getNodeMinipoolLimit.call(nodeAddress),
        ]).then(
            ([totalStake, totalEffectiveStake, nodeStake, nodeEffectiveStake, nodeMinipoolLimit]) =>
            ({totalStake, totalEffectiveStake, nodeStake, nodeEffectiveStake, nodeMinipoolLimit})
        );
    }

    // Get initial token balances & staking details
    let [balances1, details1] = await Promise.all([
        getTokenBalances(txOptions.from),
        getStakingDetails(txOptions.from),
    ]);

    // Stake RPL
    await rocketNodeStaking.withdrawRPL(amount, txOptions);

    // Get updated token balances & staking details
    let [balances2, details2] = await Promise.all([
        getTokenBalances(txOptions.from),
        getStakingDetails(txOptions.from),
    ]);

    // Calculate expected node minipool limit
    const expectedNodeMinipoolLimit = details2.nodeStake.mul(rplPrice).div(depositUserAmount.mul(minPerMinipoolStake));

    // Check token balances
    assert(balances2.nodeRpl.eq(balances1.nodeRpl.add(web3.utils.toBN(amount))), 'Incorrect updated node RPL balance');
    assert(balances2.vaultRpl.eq(balances1.vaultRpl.sub(web3.utils.toBN(amount))), 'Incorrect updated vault RPL balance');
    assert(balances2.stakingRpl.eq(balances1.stakingRpl.sub(web3.utils.toBN(amount))), 'Incorrect updated RocketNodeStaking contract RPL vault balance');

    // Check staking details
    // TODO: check effective stake amounts
    assert(details2.nodeMinipoolLimit.eq(expectedNodeMinipoolLimit), 'Incorrect updated node minipool limit');
    assert(details2.totalStake.eq(details1.totalStake.sub(web3.utils.toBN(amount))), 'Incorrect updated total RPL stake');
    assert(details2.nodeStake.eq(details1.nodeStake.sub(web3.utils.toBN(amount))), 'Incorrect updated node RPL stake');

}

