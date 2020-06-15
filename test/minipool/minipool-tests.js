import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { createMinipool } from '../_helpers/minipool';
import { registerNode } from '../_helpers/node';
import { dissolve } from './scenarios-dissolve';

export default function() {
    contract('RocketMinipool', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Minipool creation
        let minipool;
        beforeEach(async () => {
            await registerNode({from: node});
            minipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
        });


        //
        // Dissolve
        //


        it(printTitle('node operator', 'can dissolve their own minipool'), async () => {

            // Dissolve minipool
            await dissolve(minipool, {
                from: node,
            });

        });


        //
        // Stake
        //


        //
        // Close
        //


    });
}
