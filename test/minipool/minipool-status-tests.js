import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { createMinipool, stakeMinipool } from '../_helpers/minipool';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { setMinipoolSetting } from '../_helpers/settings';
import { submitWithdrawable } from './scenario-submit-withdrawable';

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
            await stakeMinipool(stakingMinipool, null, {from: node});

            // Check minipool statuses
            let stakingStatus = await stakingMinipool.getStatus.call();
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');

        });


        //
        // Submit withdrawable
        //


        it(printTitle('trusted nodes', 'can submit a withdrawable event for a staking minipool'), async () => {

            // Set parameters
            let startEpoch = 0;
            let endEpoch = 1;
            let userStartEpoch = 0;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Submit different withdrawable events
            await submitWithdrawable(stakingMinipool.address, web3.utils.toWei('37', 'ether'), startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode1,
            });
            await submitWithdrawable(stakingMinipool.address, web3.utils.toWei('38', 'ether'), startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode2,
            });
            await submitWithdrawable(stakingMinipool.address, web3.utils.toWei('39', 'ether'), startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode3,
            });

            // Submit identical withdrawable events to trigger update
            await submitWithdrawable(stakingMinipool.address, withdrawalBalance, startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode1,
            });
            await submitWithdrawable(stakingMinipool.address, withdrawalBalance, startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode2,
            });

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for a minipool while withdrawable submissions are disabled'), async () => {

            // Set parameters
            let startEpoch = 0;
            let endEpoch = 1;
            let userStartEpoch = 0;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Disable submissions
            await setMinipoolSetting('SubmitWithdrawableEnabled', false, {from: owner});

            // Attempt to submit withdrawable event for staking minipool
            await shouldRevert(submitWithdrawable(stakingMinipool.address, withdrawalBalance, startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode1,
            }), 'Submitted a withdrawable event while withdrawable submissions were disabled');

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for a minipool which is not staking'), async () => {

            // Set parameters
            let startEpoch = 0;
            let endEpoch = 1;
            let userStartEpoch = 0;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Submit withdrawable events to trigger update
            await submitWithdrawable(stakingMinipool.address, withdrawalBalance, startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode1,
            });
            await submitWithdrawable(stakingMinipool.address, withdrawalBalance, startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode2,
            });

            // Attempt to submit withdrawable event for withdrawable minipool
            await shouldRevert(submitWithdrawable(stakingMinipool.address, withdrawalBalance, startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode3,
            }), 'Submitted a withdrawable event for a minipool which was not staking');

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for an invalid minipool'), async () => {

            // Set parameters
            let startEpoch = 0;
            let endEpoch = 1;
            let userStartEpoch = 0;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Attempt to submit withdrawable event for invalid minipool
            await shouldRevert(submitWithdrawable(random, withdrawalBalance, startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode1,
            }), 'Submitted a withdrawable event for an invalid minipool');

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for a minipool twice'), async () => {

            // Set parameters
            let startEpoch = 0;
            let endEpoch = 1;
            let userStartEpoch = 0;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Submit withdrawable event for staking minipool
            await submitWithdrawable(stakingMinipool.address, withdrawalBalance, startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode1,
            });

            // Attempt to submit withdrawable event for staking minipool again
            await shouldRevert(submitWithdrawable(stakingMinipool.address, withdrawalBalance, startEpoch, endEpoch, userStartEpoch, {
                from: trustedNode1,
            }), 'Submitted the same withdrawable event for a minipool twice');

        });


        it(printTitle('regular nodes', 'cannot submit a withdrawable event for a minipool'), async () => {

            // Set parameters
            let startEpoch = 0;
            let endEpoch = 1;
            let userStartEpoch = 0;
            let withdrawalBalance = web3.utils.toWei('36', 'ether');

            // Attempt to submit withdrawable event for staking minipool
            await shouldRevert(submitWithdrawable(stakingMinipool.address, withdrawalBalance, startEpoch, endEpoch, userStartEpoch, {
                from: node,
            }), 'Regular node submitted a withdrawable event for a minipool');

        });


    });
}
