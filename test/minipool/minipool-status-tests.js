import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { createMinipool, stakeMinipool, exitMinipool } from '../_helpers/minipool';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { exit } from './scenarios-exit';
import { withdraw } from './scenarios-withdraw';

export default function() {
    contract('RocketMinipoolStatus', async (accounts) => {


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
        let prelaunchMinipool;
        let stakingMinipool;
        let exitedMinipool;
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

            // Create minipools
            prelaunchMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            stakingMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            exitedMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});

            // Stake minipools
            await stakeMinipool(stakingMinipool, {from: node});
            await stakeMinipool(exitedMinipool, {from: node});

            // Exit minipool
            await exitMinipool(exitedMinipool.address, {from: trustedNode});

            // Check minipool statuses
            let prelaunchStatus = await prelaunchMinipool.getStatus.call();
            let stakingStatus = await stakingMinipool.getStatus.call();
            let exitedStatus = await exitedMinipool.getStatus.call();
            assert(prelaunchStatus.eq(web3.utils.toBN(1)), 'Incorrect prelaunch minipool status');
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            assert(exitedStatus.eq(web3.utils.toBN(3)), 'Incorrect exited minipool status');

        });


        //
        // Exit
        //


        it(printTitle('trusted node', 'can exit a staking minipool'), async () => {

            // Exit staking minipool
            await exit(stakingMinipool.address, {
                from: trustedNode,
            });

        });


        it(printTitle('trusted node', 'cannot exit a minipool which is not staking'), async () => {

            // Attempt to exit prelaunch minipool
            await shouldRevert(exit(prelaunchMinipool.address, {
                from: trustedNode,
            }), 'Exited a minipool which was not staking');

        });


        it(printTitle('trusted node', 'cannot exit an invalid minipool'), async () => {

            // Attempt to exit invalid minipool
            await shouldRevert(exit(random, {
                from: trustedNode,
            }), 'Exited an invalid minipool');

        });


        it(printTitle('regular node', 'cannot exit a minipool'), async () => {

            // Attempt to exit staking minipool
            await shouldRevert(exit(stakingMinipool.address, {
                from: node,
            }), 'Regular node exited a minipool');

        });


        //
        // Withdraw
        //


        it(printTitle('trusted node', 'can withdraw an exited minipool'), async () => {

            // Withdraw exited minipool
            await withdraw(exitedMinipool.address, web3.utils.toWei('36', 'ether'), {
                from: trustedNode,
            });

        });


        it(printTitle('trusted node', 'cannot withdraw a minipool which is not exited'), async () => {

            // Attempt to withdraw staking minipool
            await shouldRevert(withdraw(stakingMinipool.address, web3.utils.toWei('36', 'ether'), {
                from: trustedNode,
            }), 'Withdrew a minipool which was not exited');

        });


        it(printTitle('trusted node', 'cannot withdraw an invalid minipool'), async () => {

            // Attempt to withdraw invalid minipool
            await shouldRevert(withdraw(random, web3.utils.toWei('36', 'ether'), {
                from: trustedNode,
            }), 'Withdrew an invalid minipool');

        });


        it(printTitle('regular node', 'cannot withdraw a minipool'), async () => {

            // Attempt to withdraw exited minipool
            await shouldRevert(withdraw(exitedMinipool.address, web3.utils.toWei('36', 'ether'), {
                from: node,
            }), 'Regular node withdrew a minipool');

        });


    });
}
