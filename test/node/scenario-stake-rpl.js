import {
    RocketMinipoolManager,
    RocketDAOProtocolSettingsMinipool,
    RocketNetworkPrices,
    RocketDAOProtocolSettingsNode,
    RocketNodeStaking,
    RocketTokenRPL,
    RocketVault,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Stake RPL against the node
export async function stakeRpl(amount, txOptions) {
    // Load contracts
    const [
        rocketMinipoolManager,
        rocketDAOProtocolSettingsMinipool,
        rocketNetworkPrices,
        rocketDAOProtocolSettingsNode,
        rocketNodeStaking,
        rocketTokenRPL,
        rocketVault,
    ] = await Promise.all([
        RocketMinipoolManager.deployed(),
        RocketDAOProtocolSettingsMinipool.deployed(),
        RocketNetworkPrices.deployed(),
        RocketDAOProtocolSettingsNode.deployed(),
        RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
        RocketVault.deployed(),
    ]);

    // Get parameters
    const [
        depositUserAmount,
        minPerMinipoolStake,
        maxPerMinipoolStake,
        rplPrice,
    ] = await Promise.all([
        rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount.call(),
        rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake.call(),
        rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake.call(),
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
            rocketNodeStaking.getNodeRPLStake.call(nodeAddress),
            rocketNodeStaking.getNodeEffectiveRPLStake.call(nodeAddress),
            rocketNodeStaking.getNodeETHMatched.call(nodeAddress),
            rocketNodeStaking.getNodeETHMatchedLimit.call(nodeAddress),
            rocketNodeStaking.getNodeETHProvided.call(nodeAddress),
        ]).then(
            ([totalStake, nodeStake, nodeEffectiveStake, nodeEthMatched, nodeEthMatchedLimit, nodeEthProvided]) =>
            ({totalStake, nodeStake, nodeEffectiveStake, nodeEthMatched, nodeEthMatchedLimit, nodeEthProvided})
        );
    }

    // Get initial token balances & staking details
    let [balances1, details1] = await Promise.all([
        getTokenBalances(txOptions.from),
        getStakingDetails(txOptions.from),
    ]);

    // Stake RPL
    await rocketNodeStaking.stakeRPL(amount, txOptions);

    // Get updated token balances, staking details & minipool counts
    let [balances2, details2] = await Promise.all([
        getTokenBalances(txOptions.from),
        getStakingDetails(txOptions.from),
    ]);

    // Calculate expected effective stakes & node minipool limit
    const maxNodeEffectiveStake = details2.nodeEthProvided.mul(maxPerMinipoolStake).div(rplPrice);
    const expectedNodeEffectiveStake = (details2.nodeStake.lt(maxNodeEffectiveStake) ? details2.nodeStake : maxNodeEffectiveStake);
    const expectedNodeEthMatchedLimit = details2.nodeStake.mul(rplPrice).div(minPerMinipoolStake);

    // Check token balances
    assertBN.equal(balances2.nodeRpl, balances1.nodeRpl.sub(web3.utils.toBN(amount)), 'Incorrect updated node RPL balance');
    assertBN.equal(balances2.vaultRpl, balances1.vaultRpl.add(web3.utils.toBN(amount)), 'Incorrect updated vault RPL balance');
    assertBN.equal(balances2.stakingRpl, balances1.stakingRpl.add(web3.utils.toBN(amount)), 'Incorrect updated RocketNodeStaking contract RPL vault balance');

    // Check staking details
    assertBN.equal(details2.totalStake, details1.totalStake.add(web3.utils.toBN(amount)), 'Incorrect updated total RPL stake');
    assertBN.equal(details2.nodeStake, details1.nodeStake.add(web3.utils.toBN(amount)), 'Incorrect updated node RPL stake');
    assertBN.equal(details2.nodeEffectiveStake, expectedNodeEffectiveStake, 'Incorrect updated effective node RPL stake');
    assertBN.equal(details2.nodeEthMatchedLimit, expectedNodeEthMatchedLimit, 'Incorrect updated node minipool limit');
}
