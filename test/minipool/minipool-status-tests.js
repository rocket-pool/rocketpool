import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { createMinipool, stakeMinipool, setMinipoolExited } from '../_helpers/minipool';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { setExited } from './scenarios-exited';
import { setWithdrawable } from './scenarios-withdrawable';

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
            await stakeMinipool(stakingMinipool, null, {from: node});
            await stakeMinipool(exitedMinipool, null, {from: node});
            await setMinipoolExited(exitedMinipool.address, {from: trustedNode});

            // Check minipool statuses
            let prelaunchStatus = await prelaunchMinipool.getStatus.call();
            let stakingStatus = await stakingMinipool.getStatus.call();
            let exitedStatus = await exitedMinipool.getStatus.call();
            assert(prelaunchStatus.eq(web3.utils.toBN(1)), 'Incorrect prelaunch minipool status');
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            assert(exitedStatus.eq(web3.utils.toBN(3)), 'Incorrect exited minipool status');

        });


        //
        // Set exited
        //


        it(printTitle('trusted node', 'can set a staking minipool to exited'), async () => {

            // Set staking minipool to exited
            await setExited(stakingMinipool.address, {
                from: trustedNode,
            });

        });


        it(printTitle('trusted node', 'cannot set a minipool which is not staking to exited'), async () => {

            // Attempt to set prelaunch minipool to exited
            await shouldRevert(setExited(prelaunchMinipool.address, {
                from: trustedNode,
            }), 'Set a minipool which was not staking to exited');

        });


        it(printTitle('trusted node', 'cannot set an invalid minipool to exited'), async () => {

            // Attempt to set invalid minipool to exited
            await shouldRevert(setExited(random, {
                from: trustedNode,
            }), 'Set an invalid minipool to exited');

        });


        it(printTitle('regular node', 'cannot set a minipool to exited'), async () => {

            // Attempt to set staking minipool to exited
            await shouldRevert(setExited(stakingMinipool.address, {
                from: node,
            }), 'Regular node set a minipool to exited');

        });


        //
        // Set withdrawable
        //


        it(printTitle('trusted node', 'can set an exited minipool to withdrawable'), async () => {

            // Set exited minipool to withdrawable
            await setWithdrawable(exitedMinipool.address, web3.utils.toWei('36', 'ether'), {
                from: trustedNode,
            });

        });


        it(printTitle('trusted node', 'cannot set a minipool which is not exited to withdrawable'), async () => {

            // Attempt to set staking minipool to withdrawable
            await shouldRevert(setWithdrawable(stakingMinipool.address, web3.utils.toWei('36', 'ether'), {
                from: trustedNode,
            }), 'Set a minipool which was not exited to withdrawable');

        });


        it(printTitle('trusted node', 'cannot set an invalid minipool to withdrawable'), async () => {

            // Attempt to set invalid minipool to withdrawable
            await shouldRevert(setWithdrawable(random, web3.utils.toWei('36', 'ether'), {
                from: trustedNode,
            }), 'Set an invalid minipool to withdrawable');

        });


        it(printTitle('regular node', 'cannot set a minipool to withdrawable'), async () => {

            // Attempt to set exited minipool to withdrawable
            await shouldRevert(setWithdrawable(exitedMinipool.address, web3.utils.toWei('36', 'ether'), {
                from: node,
            }), 'Regular node set a minipool to withdrawable');

        });


    });
}
