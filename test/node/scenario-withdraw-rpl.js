import {
    RocketMinipoolManager,
    RocketDAOProtocolSettingsMinipool,
    RocketNetworkPrices,
    RocketDAOProtocolSettingsNode,
    RocketNodeStaking,
    RocketTokenRPL,
    RocketVault,
    RocketNodeManager,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Withdraw RPL staked against the node
export async function withdrawRpl(amount, txOptions) {
    // Load contracts
    const [
        rocketMinipoolManager,
        rocketDAOProtocolSettingsMinipool,
        rocketNetworkPrices,
        rocketDAOProtocolSettingsNode,
        rocketNodeManager,
        rocketNodeStaking,
        rocketTokenRPL,
        rocketVault,
    ] = await Promise.all([
        RocketMinipoolManager.deployed(),
        RocketDAOProtocolSettingsMinipool.deployed(),
        RocketNetworkPrices.deployed(),
        RocketDAOProtocolSettingsNode.deployed(),
        RocketNodeManager.deployed(),
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
        rplWithdrawalAddress
    ] = await Promise.all([
        rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount.call(),
        rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake.call(),
        rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake.call(),
        rocketNetworkPrices.getRPLPrice.call(),
        rocketNodeManager.getNodeRPLWithdrawalAddress(txOptions.from),
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
        ]).then(
            ([totalStake, nodeStake, nodeEffectiveStake, nodeEthMatched, nodeEthMatchedLimit]) =>
            ({totalStake, nodeStake, nodeEffectiveStake, nodeEthMatched, nodeEthMatchedLimit})
        );
    }

    // Get minipool counts
    function getMinipoolCounts(nodeAddress) {
        return Promise.all([
            rocketMinipoolManager.getMinipoolCount.call(),
            rocketMinipoolManager.getNodeMinipoolCount.call(nodeAddress),
        ]).then(
            ([total, node]) =>
            ({total, node})
        );
    }

    // Get initial token balances & staking details
    let [balances1, details1] = await Promise.all([
        getTokenBalances(rplWithdrawalAddress),
        getStakingDetails(txOptions.from),
    ]);

    // Withdraw RPL
    await rocketNodeStaking.methods['withdrawRPL(uint256)'](amount, txOptions);

    // Get updated token balances, staking details & minipool counts
    let [balances2, details2, minipoolCounts] = await Promise.all([
        getTokenBalances(rplWithdrawalAddress),
        getStakingDetails(txOptions.from),
        getMinipoolCounts(txOptions.from),
    ]);

    // Calculate expected effective stakes & node minipool limit
    const maxNodeEffectiveStake = details2.nodeEthMatched.mul(maxPerMinipoolStake).div(rplPrice);
    const expectedNodeEffectiveStake = (details2.nodeStake.lt(maxNodeEffectiveStake)? details2.nodeStake : maxNodeEffectiveStake);
    const expectedNodeEthMatchedLimit = details2.nodeStake.mul(rplPrice).div(minPerMinipoolStake);

    // Check token balances
    assertBN.equal(balances2.nodeRpl, balances1.nodeRpl.add(web3.utils.toBN(amount)), 'Incorrect updated node RPL balance');
    assertBN.equal(balances2.vaultRpl, balances1.vaultRpl.sub(web3.utils.toBN(amount)), 'Incorrect updated vault RPL balance');
    assertBN.equal(balances2.stakingRpl, balances1.stakingRpl.sub(web3.utils.toBN(amount)), 'Incorrect updated RocketNodeStaking contract RPL vault balance');

    // Check staking details
    assertBN.equal(details2.totalStake, details1.totalStake.sub(web3.utils.toBN(amount)), 'Incorrect updated total RPL stake');
    assertBN.equal(details2.nodeStake, details1.nodeStake.sub(web3.utils.toBN(amount)), 'Incorrect updated node RPL stake');
    assertBN.equal(details2.nodeEffectiveStake, expectedNodeEffectiveStake, 'Incorrect updated effective node RPL stake');
    assertBN.equal(details2.nodeEthMatchedLimit, expectedNodeEthMatchedLimit, 'Incorrect updated node minipool limit');
}
