import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { createMinipool, stakeMinipool, submitMinipoolExited } from '../_helpers/minipool';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { submitExited } from './scenarios-exited';
import { submitWithdrawable } from './scenarios-withdrawable';

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
            await submitMinipoolExited(exitedMinipool.address, 1, {from: trustedNode});

            // Check minipool statuses
            let prelaunchStatus = await prelaunchMinipool.getStatus.call();
            let stakingStatus = await stakingMinipool.getStatus.call();
            let exitedStatus = await exitedMinipool.getStatus.call();
            assert(prelaunchStatus.eq(web3.utils.toBN(1)), 'Incorrect prelaunch minipool status');
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            assert(exitedStatus.eq(web3.utils.toBN(3)), 'Incorrect exited minipool status');

        });


        //
        // Submit exited
        //


        it(printTitle('trusted node', 'can submit an exited event for a staking minipool'), async () => {

            // Submit staking minipool exited event
            await submitExited(stakingMinipool.address, 1, {
                from: trustedNode,
            });

        });


        it(printTitle('trusted node', 'cannot submit an exited event for a minipool which is not staking'), async () => {

            // Attempt to submit prelaunch minipool exited event
            await shouldRevert(submitExited(prelaunchMinipool.address, 1, {
                from: trustedNode,
            }), 'Submitted an exited event for a minipool which was not staking');

        });


        it(printTitle('trusted node', 'cannot submit an exited event for an invalid minipool'), async () => {

            // Attempt to submit invalid minipool exited event
            await shouldRevert(submitExited(random, 1, {
                from: trustedNode,
            }), 'Submitted an exited event for an invalid minipool');

        });


        it(printTitle('regular node', 'cannot submit an exited event for a minipool'), async () => {

            // Attempt to submit staking minipool exited event
            await shouldRevert(submitExited(stakingMinipool.address, 1, {
                from: node,
            }), 'Regular node submitted an exited event for a minipool');

        });


        //
        // Submit withdrawable
        //


        it(printTitle('trusted node', 'can submit a withdrawable event for an exited minipool'), async () => {

            // Submit exited minipool withdrawable event
            await submitWithdrawable(exitedMinipool.address, web3.utils.toWei('36', 'ether'), 1, {
                from: trustedNode,
            });

        });


        it(printTitle('trusted node', 'cannot submit a withdrawable event for a minipool which is not exited'), async () => {

            // Attempt to submit staking minipool withdrawable event
            await shouldRevert(submitWithdrawable(stakingMinipool.address, web3.utils.toWei('36', 'ether'), 1, {
                from: trustedNode,
            }), 'Submitted a withdrawable event for a minipool which was not exited');

        });


        it(printTitle('trusted node', 'cannot submit a withdrawable event for an invalid minipool'), async () => {

            // Attempt to submit invalid minipool withdrawable event
            await shouldRevert(submitWithdrawable(random, web3.utils.toWei('36', 'ether'), 1, {
                from: trustedNode,
            }), 'Submitted a withdrawable event for an invalid minipool');

        });


        it(printTitle('regular node', 'cannot submit a withdrawable event for a minipool'), async () => {

            // Attempt to submit exited minipool withdrawable event
            await shouldRevert(submitWithdrawable(exitedMinipool.address, web3.utils.toWei('36', 'ether'), 1, {
                from: node,
            }), 'Regular node submitted a withdrawable event for a minipool');

        });


    });
}
