import {
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNode,
    RocketMinipoolManager,
    RocketNetworkPrices,
    RocketNodeManager,
    RocketNodeStaking,
    RocketTokenRPL,
    RocketVault,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

// Withdraw RPL staked against the node
export async function withdrawRpl(amount, txOptions) {
    // Load contracts
    const [
        rocketMinipoolManager,
        rocketNetworkPrices,
        rocketDAOProtocolSettingsNode,
        rocketNodeManager,
        rocketNodeStaking,
        rocketTokenRPL,
        rocketVault,
    ] = await Promise.all([
        RocketMinipoolManager.deployed(),
        RocketNetworkPrices.deployed(),
        RocketDAOProtocolSettingsNode.deployed(),
        RocketNodeManager.deployed(),
        RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
        RocketVault.deployed(),
    ]);

    // Get parameters
    const [
        minPerMinipoolStake,
        maxPerMinipoolStake,
        rplPrice,
        rplWithdrawalAddress,
    ] = await Promise.all([
        rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake(),
        rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake(),
        rocketNetworkPrices.getRPLPrice(),
        rocketNodeManager.getNodeRPLWithdrawalAddress(txOptions.from.address),
    ]);

    // Get token balances
    function getTokenBalances(nodeAddress) {
        return Promise.all([
            rocketTokenRPL.balanceOf(nodeAddress),
            rocketTokenRPL.balanceOf(rocketVault.target),
            rocketVault.balanceOfToken('rocketNodeStaking', rocketTokenRPL.target),
        ]).then(
            ([nodeRpl, vaultRpl, stakingRpl]) =>
                ({ nodeRpl, vaultRpl, stakingRpl }),
        );
    }

    // Get staking details
    function getStakingDetails(nodeAddress) {
        return Promise.all([
            rocketNodeStaking.getTotalRPLStake(),
            rocketNodeStaking.getNodeRPLStake(nodeAddress),
            rocketNodeStaking.getNodeEffectiveRPLStake(nodeAddress),
            rocketNodeStaking.getNodeETHMatched(nodeAddress),
            rocketNodeStaking.getNodeETHMatchedLimit(nodeAddress),
        ]).then(
            ([totalStake, nodeStake, nodeEffectiveStake, nodeEthMatched, nodeEthMatchedLimit]) =>
                ({ totalStake, nodeStake, nodeEffectiveStake, nodeEthMatched, nodeEthMatchedLimit }),
        );
    }

    // Get minipool counts
    function getMinipoolCounts(nodeAddress) {
        return Promise.all([
            rocketMinipoolManager.getMinipoolCount(),
            rocketMinipoolManager.getNodeMinipoolCount(nodeAddress),
        ]).then(
            ([total, node]) =>
                ({ total, node }),
        );
    }

    // Get initial token balances & staking details
    let [balances1, details1] = await Promise.all([
        getTokenBalances(rplWithdrawalAddress),
        getStakingDetails(txOptions.from),
    ]);

    // Withdraw RPL
    await rocketNodeStaking.connect(txOptions.from)['withdrawRPL(uint256)'](amount, txOptions);

    // Get updated token balances, staking details & minipool counts
    let [balances2, details2, minipoolCounts] = await Promise.all([
        getTokenBalances(rplWithdrawalAddress),
        getStakingDetails(txOptions.from),
        getMinipoolCounts(txOptions.from),
    ]);

    // Calculate expected effective stakes & node minipool limit
    const maxNodeEffectiveStake = details2.nodeEthMatched * maxPerMinipoolStake / rplPrice;
    const expectedNodeEffectiveStake = (details2.nodeStake < maxNodeEffectiveStake) ? details2.nodeStake : maxNodeEffectiveStake;
    const expectedNodeEthMatchedLimit = details2.nodeStake * rplPrice / minPerMinipoolStake;

    // Check token balances
    assertBN.equal(balances2.nodeRpl, balances1.nodeRpl + amount, 'Incorrect updated node RPL balance');
    assertBN.equal(balances2.vaultRpl, balances1.vaultRpl - amount, 'Incorrect updated vault RPL balance');
    assertBN.equal(balances2.stakingRpl, balances1.stakingRpl - amount, 'Incorrect updated RocketNodeStaking contract RPL vault balance');

    // Check staking details
    assertBN.equal(details2.totalStake, details1.totalStake - amount, 'Incorrect updated total RPL stake');
    assertBN.equal(details2.nodeStake, details1.nodeStake - amount, 'Incorrect updated node RPL stake');
    assertBN.equal(details2.nodeEffectiveStake, expectedNodeEffectiveStake, 'Incorrect updated effective node RPL stake');
    assertBN.equal(details2.nodeEthMatchedLimit, expectedNodeEthMatchedLimit, 'Incorrect updated node minipool limit');
}
