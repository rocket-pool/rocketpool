import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { auctionCreateLot, auctionPlaceBid } from '../_helpers/auction';
import { userDeposit } from '../_helpers/deposit';
import { createMinipool, stakeMinipool, submitMinipoolWithdrawable } from '../_helpers/minipool';
import { registerNode, setNodeTrusted, nodeStakeRPL } from '../_helpers/node';
import { setAuctionSetting } from '../_helpers/settings';
import { mintRPL } from '../_helpers/tokens';
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
            trustedNode,
            random1,
            random2,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let minipool;
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

            // Mint RPL to node & stake; create & stake minipool
            const rplAmount = web3.utils.toWei('10000', 'ether');
            await mintRPL(owner, node, rplAmount);
            await nodeStakeRPL(rplAmount, {from: node});
            minipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            await userDeposit({from: random1, value: web3.utils.toWei('16', 'ether')});
            await stakeMinipool(minipool, null, {from: node});

        });


        it(printTitle('random address', 'can create a lot'), async () => {

            // Slash RPL assigned to minipool to fill auction contract
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});

            // Create first lot
            await createLot({
                from: random1,
            });

            // Create second lot
            await createLot({
                from: random1,
            });

        });


        it(printTitle('random address', 'cannot create a lot while lot creation is disabled'), async () => {

            // Slash RPL assigned to minipool to fill auction contract
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});

            // Disable lot creation
            await setAuctionSetting('CreateLotEnabled', false, {from: owner});

            // Attempt to create lot
            await shouldRevert(createLot({
                from: random1,
            }), 'Created a lot while lot creation was disabled');

        });


        it(printTitle('random address', 'cannot create a lot with an insufficient RPL balance'), async () => {

            // Attempt to create lot
            await shouldRevert(createLot({
                from: random1,
            }), 'Created a lot with an insufficient RPL balance');

        });


        it(printTitle('random address', 'can place a bid on a lot'), async () => {

            // Create lots
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});
            await auctionCreateLot({from: random1});

            // Place bid on first lot from first address
            await placeBid(0, {
                from: random1,
                value: web3.utils.toWei('4', 'ether'),
            });

            // Increase bid on first lot from first address
            await placeBid(0, {
                from: random1,
                value: web3.utils.toWei('4', 'ether'),
            });

            // Place bid on first lot from second address
            await placeBid(0, {
                from: random2,
                value: web3.utils.toWei('4', 'ether'),
            });

            // Place bid on second lot from first address
            await placeBid(1, {
                from: random1,
                value: web3.utils.toWei('2', 'ether'),
            });

            // Increase bid on second lot from first address
            await placeBid(1, {
                from: random1,
                value: web3.utils.toWei('2', 'ether'),
            });

            // Place bid on second lot from second address
            await placeBid(1, {
                from: random2,
                value: web3.utils.toWei('2', 'ether'),
            });

        });


        it(printTitle('random address', 'cannot bid on a lot which doesn\'t exist'), async () => {

            // Create lot
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});

            // Attempt to place bid
            await shouldRevert(placeBid(1, {
                from: random1,
                value: web3.utils.toWei('4', 'ether'),
            }), 'Bid on a lot which doesn\'t exist');

        });


        it(printTitle('random address', 'cannot bid on a lot while bidding is disabled'), async () => {

            // Create lot
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});

            // Disable bidding
            await setAuctionSetting('BidOnLotEnabled', false, {from: owner});

            // Attempt to place bid
            await shouldRevert(placeBid(0, {
                from: random1,
                value: web3.utils.toWei('4', 'ether'),
            }), 'Bid on a lot while bidding was disabled');

        });


        it(printTitle('random address', 'cannot bid an invalid amount on a lot'), async () => {

            // Create lot
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});

            // Attempt to place bid
            await shouldRevert(placeBid(0, {
                from: random1,
                value: web3.utils.toWei('0', 'ether'),
            }), 'Bid an invalid amount on a lot');

        });


        it(printTitle('random address', 'cannot bid on a lot after the lot bidding period has concluded'), async () => {

            // Set lot duration
            await setAuctionSetting('LotDuration', 0, {from: owner});

            // Create lot
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});

            // Attempt to place bid
            await shouldRevert(placeBid(0, {
                from: random1,
                value: web3.utils.toWei('4', 'ether'),
            }), 'Bid on a lot after the bidding period concluded');

        });


        it(printTitle('random address', 'cannot bid on a lot after the RPL allocation has been exhausted'), async () => {

            // Create lot
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});

            // Place bid & claim all RPL
            await placeBid(0, {
                from: random1,
                value: web3.utils.toWei('1000', 'ether'),
            });

            // Attempt to place bid
            await shouldRevert(placeBid(0, {
                from: random2,
                value: web3.utils.toWei('4', 'ether'),
            }), 'Bid on a lot after the RPL allocation was exhausted');

        });


        it(printTitle('random address', 'can claim RPL from a lot'), async () => {

            // Create lots & place bids to clear
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});
            await auctionCreateLot({from: random1});
            await auctionPlaceBid(0, {from: random1, value: web3.utils.toWei('5', 'ether')});
            await auctionPlaceBid(0, {from: random2, value: web3.utils.toWei('5', 'ether')});
            await auctionPlaceBid(1, {from: random1, value: web3.utils.toWei('3', 'ether')});
            await auctionPlaceBid(1, {from: random2, value: web3.utils.toWei('3', 'ether')});

            // Claim RPL on first lot from first address
            await claimBid(0, {
                from: random1, 
            });

            // Claim RPL on first lot from second address
            await claimBid(0, {
                from: random2, 
            });

            // Claim RPL on second lot from first address
            await claimBid(1, {
                from: random1, 
            });

            // Claim RPL on second lot from second address
            await claimBid(1, {
                from: random2, 
            });

        });


        it(printTitle('random address', 'cannot claim RPL from a lot which doesn\'t exist'), async () => {

        });


        it(printTitle('random address', 'cannot claim RPL from a lot before it has cleared'), async () => {

        });


        it(printTitle('random address', 'cannot claim RPL from a lot it has not bid on'), async () => {

        });


        it(printTitle('random address', 'can recover unclaimed RPL from a lot'), async () => {

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot which doesn\'t exist'), async () => {

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot before the lot bidding period has concluded'), async () => {

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot which has no RPL to recover'), async () => {

        });


    });
}
