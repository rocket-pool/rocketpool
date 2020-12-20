import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { createLot } from './scenario-create-lot';
import { placeBid } from './scenario-place-bid';
import { claimBid } from './scenario-claim-bid';
import { recoverUnclaimedRPL } from './scenario-recover-rpl';

export default function() {
    contract('RocketAuctionManager', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        before(async () => {});


        it(printTitle('random address', 'can create a lot'));


        it(printTitle('random address', 'cannot create a lot while lot creation is disabled'));


        it(printTitle('random address', 'cannot create a lot with an insufficient RPL balance'));


        it(printTitle('random address', 'can place a bid on a lot'));


        it(printTitle('random address', 'cannot bid on a lot while bidding is disabled'));


        it(printTitle('random address', 'cannot bid on a lot after the lot bidding period has concluded'));


        it(printTitle('random address', 'cannot bid on a lot after the RPL allocation has been exhausted'));


        it(printTitle('random address', 'can claim RPL from a lot'));


        it(printTitle('random address', 'cannot claim RPL from a lot before it has cleared'));


        it(printTitle('random address', 'cannot claim RPL from a lot it has not bid on'));


        it(printTitle('random address', 'can recover unclaimed RPL from a lot'));


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot before the lot bidding period has concluded'));


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot which has no RPL to recover'));


    });
}
