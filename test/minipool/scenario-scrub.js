// Dissolve a minipool
import { RocketDAONodeTrusted } from '../_utils/artifacts';


export async function voteScrub(minipool, txOptions) {

    // Get minipool details
    function getMinipoolDetails() {
        return Promise.all([
            minipool.getStatus.call(),
            minipool.getUserDepositBalance.call(),
            minipool.getTotalScrubVotes.call(),
        ]).then(
            ([status, userDepositBalance, votes]) =>
            ({status, userDepositBalance, votes})
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
    } else {
        assert(details2.votes.sub(details1.votes).eq(web3.utils.toBN(1)), 'Vote count not incremented');
        assert(!details2.status.eq(dissolved), 'Incorrect updated minipool status');
    }

}

