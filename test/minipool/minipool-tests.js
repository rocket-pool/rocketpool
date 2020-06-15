import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { createMinipool } from '../_helpers/minipool';
import { registerNode } from '../_helpers/node';
import { setMinipoolSetting } from '../_helpers/settings';
import { dissolve } from './scenarios-dissolve';

export default function() {
    contract('RocketMinipool', async (accounts) => {


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


        // Set settings
        let launchTimeout = 10;
        before(async () => {
            await setMinipoolSetting('LaunchTimeout', launchTimeout, {from: owner});
        });


        // Minipool creation
        let initializedMinipool;
        let prelaunchMinipool;
        beforeEach(async () => {

            // Create minipools
            await registerNode({from: node});
            initializedMinipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            prelaunchMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});

            // Check minipool statuses
            let initializedStatus = await initializedMinipool.getStatus.call();
            let prelaunchStatus = await prelaunchMinipool.getStatus.call();
            assert(initializedStatus.eq(web3.utils.toBN(0)), 'Incorrect initialized minipool status');
            assert(prelaunchStatus.eq(web3.utils.toBN(1)), 'Incorrect prelaunch minipool status');

        });


        //
        // Dissolve
        //


        it(printTitle('node operator', 'can dissolve their own minipool'), async () => {

            // Dissolve minipools
            await dissolve(initializedMinipool, {
                from: node,
            });
            await dissolve(prelaunchMinipool, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot dissolve their own minipool which has begun staking'));


        it(printTitle('random address', 'can dissolve a timed out minipool at prelaunch'), async () => {

            // Time prelaunch minipool out
            await mineBlocks(web3, launchTimeout);

            // Dissolve prelaunch minipool
            await dissolve(prelaunchMinipool, {
                from: random,
            });

        });


        it(printTitle('random address', 'cannot dissolve a minipool which is not at prelaunch'), async () => {

            // Time prelaunch minipool out
            await mineBlocks(web3, launchTimeout);

            // Attempt to dissolve initialized minipool
            await shouldRevert(dissolve(initializedMinipool, {
                from: random,
            }), 'Random address dissolved a minipool which is not at prelaunch');

        });


        it(printTitle('random address', 'cannot dissolve a minipool which has not timed out'), async () => {

            // Attempt to dissolve prelaunch minipool
            await shouldRevert(dissolve(prelaunchMinipool, {
                from: random,
            }), 'Random address dissolved a minipool which has not timed out');

        });


        //
        // Stake
        //


        //
        // Close
        //


    });
}
