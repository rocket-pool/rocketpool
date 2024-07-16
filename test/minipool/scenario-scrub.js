// Dissolve a minipool
import {
    RocketDAONodeTrusted,
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsNode,
    RocketMinipoolManager,
    RocketMinipoolManagerNew,
    RocketNetworkPrices,
    RocketNodeStaking,
    RocketNodeStakingNew,
    RocketTokenRPL,
    RocketVault,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import { minipoolStates } from '../_helpers/minipool';


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
            minipool.getVacant.call(),
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
    const memberCount = await rocketDAONodeTrusted.getMemberCount();
    const quorum = memberCount.div('2'.BN);

    // Check state
    if (details1.votes.add('1'.BN).gt(quorum)){
        assertBN.equal(details2.status, minipoolStates.Dissolved, 'Incorrect updated minipool status');
        // Check slashing if penalties are enabled
        if (details1.penaltyEnabled && !details1.vacant) {
            // Calculate amount slashed
            const slashAmount = details1.nodeRPLStake.sub(details2.nodeRPLStake);
            // Get current RPL price
            const rplPrice = await rocketNetworkPrices.getRPLPrice.call();
            // Calculate amount slashed in ETH
            const slashAmountEth = slashAmount.mul(rplPrice).div('1'.ether);
            // Calculate expected slash amount
            const minimumStake = await rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake();
            const expectedSlash = details1.userDepositBalance.mul(minimumStake).div('1'.ether);
            // Perform checks
            assertBN.equal(slashAmountEth, expectedSlash, 'Amount of RPL slashed is incorrect');
            assertBN.equal(details2.auctionBalance.sub(details1.auctionBalance), slashAmount, 'RPL was not sent to auction manager');
        }
        if (details1.vacant) {
            // Expect pubkey -> minipool mapping to be removed
            const rocketMinipoolManager = await RocketMinipoolManager.deployed();
            const actualPubKey = await rocketMinipoolManager.getMinipoolPubkey(minipool.address);
            const reverseAddress = await rocketMinipoolManager.getMinipoolByPubkey(actualPubKey);
            assert.equal(reverseAddress, "0x0000000000000000000000000000000000000000");
        }
    } else {
        assertBN.equal(details2.votes.sub(details1.votes), 1, 'Vote count not incremented');
        assertBN.notEqual(details2.status, minipoolStates.Dissolved, 'Incorrect updated minipool status');
        assertBN.equal(details2.nodeRPLStake, details1.nodeRPLStake, 'RPL was slashed');
    }
}
