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
            trustedNode1,
            trustedNode2,
            trustedNode3,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let stakingMinipool;
        let exitedMinipool;
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted nodes
            await registerNode({from: trustedNode1});
            await registerNode({from: trustedNode2});
            await registerNode({from: trustedNode3});
            await setNodeTrusted(trustedNode1, {from: owner});
            await setNodeTrusted(trustedNode2, {from: owner});
            await setNodeTrusted(trustedNode3, {from: owner});

            // Create minipools
            stakingMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            exitedMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            await stakeMinipool(stakingMinipool, null, {from: node});
            await stakeMinipool(exitedMinipool, null, {from: node});
            await submitMinipoolExited(exitedMinipool.address, 1, {from: trustedNode1});
            await submitMinipoolExited(exitedMinipool.address, 1, {from: trustedNode2});

            // Check minipool statuses
            let stakingStatus = await stakingMinipool.getStatus.call();
            let exitedStatus = await exitedMinipool.getStatus.call();
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            assert(exitedStatus.eq(web3.utils.toBN(3)), 'Incorrect exited minipool status');

        });


        //
        // Submit exited
        //


        it(printTitle('trusted nodes', 'can submit an exited event for a staking minipool'), async () => {

            // Set parameters
            let epoch = 1;

            // Submit different exited events
            await submitExited(stakingMinipool.address, 2, {
                from: trustedNode1,
            });
            await submitExited(stakingMinipool.address, 3, {
                from: trustedNode2,
            });
            await submitExited(stakingMinipool.address, 4, {
                from: trustedNode3,
            });

            // Submit identical exited events to trigger update
            await submitExited(stakingMinipool.address, epoch, {
                from: trustedNode1,
            });
            await submitExited(stakingMinipool.address, epoch, {
                from: trustedNode2,
            });

        });


        it(printTitle('trusted nodes', 'cannot submit an exited event for a minipool which is not staking'), async () => {

            // Set parameters
            let epoch = 1;

            // Submit exited events to trigger update
            await submitExited(stakingMinipool.address, epoch, {
                from: trustedNode1,
            });
            await submitExited(stakingMinipool.address, epoch, {
                from: trustedNode2,
            });

            // Attempt to submit exited event for exited minipool
            await shouldRevert(submitExited(stakingMinipool.address, epoch, {
                from: trustedNode3,
            }), 'Submitted an exited event for a minipool which was not staking');

        });


        it(printTitle('trusted nodes', 'cannot submit an exited event for an invalid minipool'), async () => {

            // Set parameters
            let epoch = 1;

            // Attempt to submit exited event for invalid minipool
            await shouldRevert(submitExited(random, epoch, {
                from: trustedNode1,
            }), 'Submitted an exited event for an invalid minipool');

        });


        it(printTitle('trusted nodes', 'cannot submit an exited event for a minipool twice'), async () => {

            // Set parameters
            let epoch = 1;

            // Submit exited event for staking minipool
            await submitExited(stakingMinipool.address, epoch, {
                from: trustedNode1,
            });

            // Attempt to submit exited event for staking minipool again
            await shouldRevert(submitExited(stakingMinipool.address, epoch, {
                from: trustedNode1,
            }), 'Submitted the same exited event for a minipool twice');

        });


        it(printTitle('regular nodes', 'cannot submit an exited event for a minipool'), async () => {

            // Set parameters
            let epoch = 1;

            // Attempt to submit exited event for staking minipool
            await shouldRevert(submitExited(stakingMinipool.address, epoch, {
                from: node,
            }), 'Regular node submitted an exited event for a minipool');

        });


        //
        // Submit withdrawable
        //


        it(printTitle('trusted nodes', 'can submit a withdrawable event for an exited minipool'), async () => {

            // Set parameters
            let epoch = 1;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Submit different withdrawable events
            await submitWithdrawable(exitedMinipool.address, web3.utils.toWei('37', 'ether'), epoch, {
                from: trustedNode1,
            });
            await submitWithdrawable(exitedMinipool.address, web3.utils.toWei('38', 'ether'), epoch, {
                from: trustedNode2,
            });
            await submitWithdrawable(exitedMinipool.address, web3.utils.toWei('39', 'ether'), epoch, {
                from: trustedNode3,
            });

            // Submit identical withdrawable events to trigger update
            await submitWithdrawable(exitedMinipool.address, withdrawalBalance, epoch, {
                from: trustedNode1,
            });
            await submitWithdrawable(exitedMinipool.address, withdrawalBalance, epoch, {
                from: trustedNode2,
            });

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for a minipool which is not exited'), async () => {

            // Set parameters
            let epoch = 1;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Submit withdrawable events to trigger update
            await submitWithdrawable(exitedMinipool.address, withdrawalBalance, epoch, {
                from: trustedNode1,
            });
            await submitWithdrawable(exitedMinipool.address, withdrawalBalance, epoch, {
                from: trustedNode2,
            });

            // Attempt to submit withdrawable event for withdrawable minipool
            await shouldRevert(submitWithdrawable(exitedMinipool.address, withdrawalBalance, epoch, {
                from: trustedNode3,
            }), 'Submitted a withdrawable event for a minipool which was not exited');

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for an invalid minipool'), async () => {

            // Set parameters
            let epoch = 1;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Attempt to submit withdrawable event for invalid minipool
            await shouldRevert(submitWithdrawable(random, withdrawalBalance, epoch, {
                from: trustedNode1,
            }), 'Submitted a withdrawable event for an invalid minipool');

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for a minipool twice'), async () => {

            // Set parameters
            let epoch = 1;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Submit withdrawable event for exited minipool
            await submitWithdrawable(exitedMinipool.address, withdrawalBalance, epoch, {
                from: trustedNode1,
            });

            // Attempt to submit withdrawable event for exited minipool again
            await shouldRevert(submitWithdrawable(exitedMinipool.address, withdrawalBalance, epoch, {
                from: trustedNode1,
            }), 'Submitted the same withdrawable event for a minipool twice');

        });


        it(printTitle('regular nodes', 'cannot submit a withdrawable event for a minipool'), async () => {

            // Set parameters
            let epoch = 1;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Attempt to submit withdrawable event for exited minipool
            await shouldRevert(submitWithdrawable(exitedMinipool.address, withdrawalBalance, epoch, {
                from: node,
            }), 'Regular node submitted a withdrawable event for a minipool');

        });


    });
}
