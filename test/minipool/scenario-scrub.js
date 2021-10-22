// Dissolve a minipool
import {
    RocketDAONodeTrusted,
    RocketDAONodeTrustedSettingsMinipool,
    RocketNodeStaking,
    RocketTokenRPL,
    RocketVault
} from '../_utils/artifacts';


export async function voteScrub(minipool, txOptions) {

    // Get minipool owner
    const nodeAddress = await minipool.getNodeAddress.call();

    // Get contracts
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    const rocketVault = await RocketVault.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    const rocketDAONodeTrustedSettingsMinipool = await RocketDAONodeTrustedSettingsMinipool.deployed();

    // Get minipool details
    function getMinipoolDetails() {
        return Promise.all([
            minipool.getStatus.call(),
            minipool.getUserDepositBalance.call(),
            minipool.getTotalScrubVotes.call(),
            rocketNodeStaking.getNodeRPLStake.call(nodeAddress),
            rocketVault.balanceOfToken('rocketAuctionManager', rocketTokenRPL.address),
            rocketDAONodeTrustedSettingsMinipool.getScrubPenaltyEnabled()
        ]).then(
            ([status, userDepositBalance, votes, nodeRPLStake, auctionBalance, penaltyEnabled]) =>
            ({status, userDepositBalance, votes, nodeRPLStake, auctionBalance, penaltyEnabled})
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
        assert(details2.status.eq(dissolved), 'Incorrect updated minipool status');
        assert(details2.userDepositBalance.eq(web3.utils.toBN(0)), 'Incorrect updated minipool user deposit balance');
        if (details1.penaltyEnabled) {
            assert(details2.nodeRPLStake.lt(details1.nodeRPLStake), 'RPL was not slashed');
            const slashAmount = details1.nodeRPLStake.sub(details2.nodeRPLStake);
            assert(details2.auctionBalance.sub(details1.auctionBalance).eq(slashAmount), 'RPL was not sent to auction manager');
        }
    } else {
        assert(details2.votes.sub(details1.votes).eq(web3.utils.toBN(1)), 'Vote count not incremented');
        assert(!details2.status.eq(dissolved), 'Incorrect updated minipool status');
        assert(details2.nodeRPLStake.eq(details1.nodeRPLStake), 'RPL was slashed');
    }

}

