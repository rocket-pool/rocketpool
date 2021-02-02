import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { RocketDAONetworkSettingsAuction } from '../_utils/artifacts';
import { auctionCreateLot, auctionPlaceBid, getLotStartBlock, getLotPriceAtBlock } from '../_helpers/auction';
import { userDeposit } from '../_helpers/deposit';
import { createMinipool, stakeMinipool, submitMinipoolWithdrawable } from '../_helpers/minipool';
import { submitPrices } from '../_helpers/network';
import { registerNode, setNodeTrusted, nodeStakeRPL } from '../_helpers/node';
import { setDAONetworkBootstrapSetting } from '../dao/scenario-dao-network-bootstrap';
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
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

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
            await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsAuction, 'auction.lot.create.enabled', false, {from: owner});

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


        it(printTitle('auction lot', 'has correct price at block'), async () => {

            // Set lot settings
            await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsAuction, 'auction.lot.duration', 100, {from: owner});
            await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsAuction, 'auction.price.start', web3.utils.toWei('1', 'ether'), {from: owner});
            await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsAuction, 'auction.price.reserve', web3.utils.toWei('0', 'ether'), {from: owner});

            // Set RPL price
            await submitPrices(1, web3.utils.toWei('1', 'ether'), {from: trustedNode});

            // Create lot
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});

            // Get lot start block
            const startBlock = parseInt(await getLotStartBlock(0));

            // Set expected prices at blocks
            const values = [
                {block: startBlock +   0, expectedPrice: web3.utils.toBN(web3.utils.toWei('1.0000', 'ether'))},
                {block: startBlock +  12, expectedPrice: web3.utils.toBN(web3.utils.toWei('0.9856', 'ether'))},
                {block: startBlock +  25, expectedPrice: web3.utils.toBN(web3.utils.toWei('0.9375', 'ether'))},
                {block: startBlock +  37, expectedPrice: web3.utils.toBN(web3.utils.toWei('0.8631', 'ether'))},
                {block: startBlock +  50, expectedPrice: web3.utils.toBN(web3.utils.toWei('0.7500', 'ether'))},
                {block: startBlock +  63, expectedPrice: web3.utils.toBN(web3.utils.toWei('0.6031', 'ether'))},
                {block: startBlock +  75, expectedPrice: web3.utils.toBN(web3.utils.toWei('0.4375', 'ether'))},
                {block: startBlock +  88, expectedPrice: web3.utils.toBN(web3.utils.toWei('0.2256', 'ether'))},
                {block: startBlock + 100, expectedPrice: web3.utils.toBN(web3.utils.toWei('0.0000', 'ether'))},
            ];

            // Check fees
            for (let vi = 0; vi < values.length; ++vi) {
                let v = values[vi];
                let price = await getLotPriceAtBlock(0, v.block);
                assert(price.eq(v.expectedPrice), 'Lot price does not match expected price at block');
            }

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
            await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsAuction, 'auction.lot.bidding.enabled', false, {from: owner});

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
            await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsAuction, 'auction.lot.duration', 0, {from: owner});

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

            // Create lot & place bid to clear
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});
            await auctionPlaceBid(0, {from: random1, value: web3.utils.toWei('1000', 'ether')});

            // Attempt to claim RPL
            await shouldRevert(claimBid(1, {
                from: random1, 
            }), 'Claimed RPL from a lot which doesn\'t exist');

        });


        it(printTitle('random address', 'cannot claim RPL from a lot before it has cleared'), async () => {

            // Create lot & place bid
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});
            await auctionPlaceBid(0, {from: random1, value: web3.utils.toWei('4', 'ether')});

            // Attempt to claim RPL
            await shouldRevert(claimBid(0, {
                from: random1, 
            }), 'Claimed RPL from a lot before it has cleared');

        });


        it(printTitle('random address', 'cannot claim RPL from a lot it has not bid on'), async () => {

            // Create lot & place bid to clear
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});
            await auctionPlaceBid(0, {from: random1, value: web3.utils.toWei('1000', 'ether')});

            // Attempt to claim RPL
            await shouldRevert(claimBid(0, {
                from: random2, 
            }), 'Address claimed RPL from a lot it has not bid on');

        });


        it(printTitle('random address', 'can recover unclaimed RPL from a lot'), async () => {

            // Create closed lots
            await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsAuction, 'auction.lot.duration', 0, {from: owner});
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});
            await auctionCreateLot({from: random1});

            // Recover RPL from first lot
            await recoverUnclaimedRPL(0, {
                from: random1,
            });

            // Recover RPL from second lot
            await recoverUnclaimedRPL(1, {
                from: random1,
            });

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot which doesn\'t exist'), async () => {

            // Create closed lot
            await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsAuction, 'auction.lot.duration', 0, {from: owner});
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});

            // Attempt to recover RPL
            await shouldRevert(recoverUnclaimedRPL(1, {
                from: random1,
            }), 'Recovered unclaimed RPL from a lot which doesn\'t exist');

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot before the lot bidding period has concluded'), async () => {

            // Create lot
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});

            // Attempt to recover RPL
            await shouldRevert(recoverUnclaimedRPL(0, {
                from: random1,
            }), 'Recovered unclaimed RPL from a lot before its bidding period had concluded');

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot twice'), async () => {

            // Create closed lot
            await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsAuction, 'auction.lot.duration', 0, {from: owner});
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});

            // Recover RPL
            await recoverUnclaimedRPL(0, {from: random1});

            // Attempt to recover RPL again
            await shouldRevert(recoverUnclaimedRPL(0, {
                from: random1,
            }), 'Recovered unclaimed RPL from a lot twice');

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot which has no RPL to recover'), async () => {

            // Set lot duration
            await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsAuction, 'auction.lot.duration', 10, {from: owner});

            // Create lot & place bid to clear
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});
            await auctionCreateLot({from: random1});
            await auctionPlaceBid(0, {from: random1, value: web3.utils.toWei('1000', 'ether')});

            // Move to lot bidding period end
            await mineBlocks(web3, 10);

            // Attempt to recover RPL again
            await shouldRevert(recoverUnclaimedRPL(0, {
                from: random1,
            }), 'Recovered unclaimed RPL from a lot which had no RPL to recover');

        });
        

    });
}
