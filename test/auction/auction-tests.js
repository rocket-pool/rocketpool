import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
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
            random,
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
            await userDeposit({from: random, value: web3.utils.toWei('16', 'ether')});
            await stakeMinipool(minipool, null, {from: node});

        });


        it(printTitle('random address', 'can create a lot'), async () => {

            // Slash RPL assigned to minipool to fill auction contract
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});

            // Create lot
            await createLot({
                from: random,
            });

        });


        it(printTitle('random address', 'cannot create a lot while lot creation is disabled'), async () => {

            // Slash RPL assigned to minipool to fill auction contract
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('0', 'ether'), {from: trustedNode});

            // Disable lot creation
            await setAuctionSetting('CreateLotEnabled', false, {from: owner});

            // Attempt to create lot
            await shouldRevert(createLot({
                from: random,
            }), 'Created a lot while lot creation was disabled');

        });


        it(printTitle('random address', 'cannot create a lot with an insufficient RPL balance'), async () => {

            // Attempt to create lot
            await shouldRevert(createLot({
                from: random,
            }), 'Created a lot with an insufficient RPL balance');

        });


        it(printTitle('random address', 'can place a bid on a lot'), async () => {

        });


        it(printTitle('random address', 'cannot bid on a lot while bidding is disabled'), async () => {

        });


        it(printTitle('random address', 'cannot bid on a lot after the lot bidding period has concluded'), async () => {

        });


        it(printTitle('random address', 'cannot bid on a lot after the RPL allocation has been exhausted'), async () => {

        });


        it(printTitle('random address', 'can claim RPL from a lot'), async () => {

        });


        it(printTitle('random address', 'cannot claim RPL from a lot before it has cleared'), async () => {

        });


        it(printTitle('random address', 'cannot claim RPL from a lot it has not bid on'), async () => {

        });


        it(printTitle('random address', 'can recover unclaimed RPL from a lot'), async () => {

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot before the lot bidding period has concluded'), async () => {

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot which has no RPL to recover'), async () => {

        });


    });
}
