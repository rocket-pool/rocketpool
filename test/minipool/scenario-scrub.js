// Dissolve a minipool
import {
    RocketDAONodeTrusted,
    RocketDAONodeTrustedSettingsMinipool, RocketDAOProtocolSettingsNode, RocketNetworkPrices,
    RocketNodeStaking,
    RocketTokenRPL,
    RocketVault
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


export async function voteScrub(minipool, txOptions) {
    // Get minipool owner
    const nodeAddress = await minipool.getNodeAddress.call();

    // Get contracts
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    const rocketVault = await RocketVault.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    const rocketDAONodeTrustedSettingsMinipool = await RocketDAONodeTrustedSettingsMinipool.deployed();
    const rocketNetworkPrices = await RocketNetworkPrices.deployed();
    const rocketDAOProtocolSettingsNode = await RocketDAOProtocolSettingsNode.deployed();

    // Get minipool details
    function getMinipoolDetails() {
        return Promise.all([
            minipool.getStatus.call(),
            minipool.getUserDepositBalance.call(),
            minipool.getTotalScrubVotes.call(),
            rocketNodeStaking.getNodeRPLStake.call(nodeAddress),
            rocketVault.balanceOfToken('rocketAuctionManager', rocketTokenRPL.address),
            rocketDAONodeTrustedSettingsMinipool.getScrubPenaltyEnabled(),
            minipool.getVacant.call()
        ]).then(
            ([status, userDepositBalance, votes, nodeRPLStake, auctionBalance, penaltyEnabled, vacant]) =>
            ({status, userDepositBalance, votes, nodeRPLStake, auctionBalance, penaltyEnabled, vacant})
        );
    }

    // Get initial minipool details
    let details1 = await getMinipoolDetails();

    // Dissolve
    await minipool.voteScrub(txOptions);

    // Get updated minipool details
    let details2 = await getMinipoolDetails();

    // Get member count
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const memberCount = web3.utils.toBN(await rocketDAONodeTrusted.getMemberCount());
    const quorum = memberCount.div(web3.utils.toBN(2));

    // Check state
    const dissolved = web3.utils.toBN(4);

    if (details1.votes.add(web3.utils.toBN(1)).gt(quorum)){
        assertBN.equal(details2.status, dissolved, 'Incorrect updated minipool status');
        assertBN.equal(details2.userDepositBalance, '0', 'Incorrect updated minipool user deposit balance');
        // Check slashing if penalties are enabled
        if (details1.penaltyEnabled && !details1.vacant) {
            // Calculate amount slashed
            const slashAmount = details1.nodeRPLStake.sub(details2.nodeRPLStake);
            // Get current RPL price
            const rplPrice = await rocketNetworkPrices.getRPLPrice.call();
            // Calculate amount slashed in ETH
            const slashAmountEth = slashAmount.mul(rplPrice).div(web3.utils.toBN(web3.utils.toWei('1', 'ether')));
            // Calculate expected slash amount
            const minimumStake = await rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake();
            const expectedSlash = web3.utils.toBN(web3.utils.toWei('16', 'ether')).mul(minimumStake).div(web3.utils.toBN(web3.utils.toWei('1', 'ether')));
            // Perform checks
            assertBN.equal(slashAmountEth, expectedSlash, 'Amount of RPL slashed is incorrect');
            assertBN.equal(details2.auctionBalance.sub(details1.auctionBalance), slashAmount, 'RPL was not sent to auction manager');
        }
    } else {
        assertBN.equal(details2.votes.sub(details1.votes), 1, 'Vote count not incremented');
        assertBN.notEqual(details2.status, dissolved, 'Incorrect updated minipool status');
        assertBN.equal(details2.nodeRPLStake, details1.nodeRPLStake, 'RPL was slashed');
    }
}
