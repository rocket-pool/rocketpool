import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { userDeposit } from '../_helpers/deposit';
import { getMinipoolMinimumRPLStake, createMinipool, stakeMinipool } from '../_helpers/minipool';
import { registerNode, setNodeTrusted, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { submitWithdrawable } from './scenario-submit-withdrawable';
import { RocketDAOProtocolSettingsMinipool } from '../_utils/artifacts';
import { setDAONetworkBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';

export default function() {
    contract('RocketMinipoolStatus', async (accounts) => {

        // Accounts
        const [
            owner,
            node,
            trustedNode1,
            trustedNode2,
            trustedNode3,
            staker,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let stakingMinipool1;
        let stakingMinipool2;
        let stakingMinipool3;
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted nodes
            await registerNode({from: trustedNode1});
            await registerNode({from: trustedNode2});
            await registerNode({from: trustedNode3});
            await setNodeTrusted(trustedNode1, 'saas_1', 'node1@home.com', owner);
            await setNodeTrusted(trustedNode2, 'saas_2', 'node2@home.com', owner);
            await setNodeTrusted(trustedNode3, 'saas_3', 'node3@home.com', owner);
     

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(web3.utils.toBN(3));
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Create minipools
            stakingMinipool1 = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            stakingMinipool2 = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            stakingMinipool3 = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});

            // Make and assign deposits to minipools
            await userDeposit({from: staker, value: web3.utils.toWei('16', 'ether')});
            await userDeposit({from: staker, value: web3.utils.toWei('16', 'ether')});
            await userDeposit({from: staker, value: web3.utils.toWei('16', 'ether')});

            // Stake minipools
            await stakeMinipool(stakingMinipool1, null, {from: node});
            await stakeMinipool(stakingMinipool2, null, {from: node});
            await stakeMinipool(stakingMinipool3, null, {from: node});

            // Check minipool statuses
            let stakingStatus1 = await stakingMinipool1.getStatus.call();
            let stakingStatus2 = await stakingMinipool2.getStatus.call();
            let stakingStatus3 = await stakingMinipool3.getStatus.call();
            assert(stakingStatus1.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            assert(stakingStatus2.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            assert(stakingStatus3.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');

        });


        //
        // Submit withdrawable
        //


        it(printTitle('trusted nodes', 'can submit a withdrawable event for a staking minipool'), async () => {

            // Set parameters
            let startBalance1 = web3.utils.toWei('32', 'ether');
            let endBalance1 = web3.utils.toWei('36', 'ether');
            let startBalance2 = web3.utils.toWei('32', 'ether');
            let endBalance2 = web3.utils.toWei('28', 'ether');
            let startBalance3 = web3.utils.toWei('32', 'ether');
            let endBalance3 = web3.utils.toWei('14', 'ether');

            // Submit different withdrawable events
            await submitWithdrawable(stakingMinipool1.address, startBalance1, web3.utils.toWei('37', 'ether'), {
                from: trustedNode1,
            });
            await submitWithdrawable(stakingMinipool1.address, startBalance1, web3.utils.toWei('38', 'ether'), {
                from: trustedNode2,
            });
            await submitWithdrawable(stakingMinipool1.address, startBalance1, web3.utils.toWei('39', 'ether'), {
                from: trustedNode3,
            });

            // Submit identical withdrawable events to trigger update:

            // Minipool 1 - rewards earned
            await submitWithdrawable(stakingMinipool1.address, startBalance1, endBalance1, {
                from: trustedNode1,
            });
            await submitWithdrawable(stakingMinipool1.address, startBalance1, endBalance1, {
                from: trustedNode2,
            });

            // Minipool 2 - penalties applied
            await submitWithdrawable(stakingMinipool2.address, startBalance2, endBalance2, {
                from: trustedNode1,
            });
            await submitWithdrawable(stakingMinipool2.address, startBalance2, endBalance2, {
                from: trustedNode2,
            });

            // Minipool 3 - penalties applied & RPL slashed
            await submitWithdrawable(stakingMinipool3.address, startBalance3, endBalance3, {
                from: trustedNode1,
            });
            await submitWithdrawable(stakingMinipool3.address, startBalance3, endBalance3, {
                from: trustedNode2,
            });

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for a minipool while withdrawable submissions are disabled'), async () => {

            // Set parameters
            let startBalance = web3.utils.toWei('32', 'ether');
            let endBalance = web3.utils.toWei('36', 'ether');

            // Disable submissions
            await setDAONetworkBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.submit.withdrawable.enabled', false, {from: owner});

            // Attempt to submit withdrawable event for staking minipool
            await shouldRevert(submitWithdrawable(stakingMinipool1.address, startBalance, endBalance, {
                from: trustedNode1,
            }), 'Submitted a withdrawable event while withdrawable submissions were disabled');

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for a minipool which is not staking'), async () => {

            // Set parameters
            let startBalance = web3.utils.toWei('32', 'ether');
            let endBalance = web3.utils.toWei('36', 'ether');

            // Submit withdrawable events to trigger update
            await submitWithdrawable(stakingMinipool1.address, startBalance, endBalance, {
                from: trustedNode1,
            });
            await submitWithdrawable(stakingMinipool1.address, startBalance, endBalance, {
                from: trustedNode2,
            });

            // Attempt to submit withdrawable event for withdrawable minipool
            await shouldRevert(submitWithdrawable(stakingMinipool1.address, startBalance, endBalance, {
                from: trustedNode3,
            }), 'Submitted a withdrawable event for a minipool which was not staking');

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for an invalid minipool'), async () => {

            // Set parameters
            let startBalance = web3.utils.toWei('32', 'ether');
            let endBalance = web3.utils.toWei('36', 'ether');

            // Attempt to submit withdrawable event for invalid minipool
            await shouldRevert(submitWithdrawable(random, startBalance, endBalance, {
                from: trustedNode1,
            }), 'Submitted a withdrawable event for an invalid minipool');

        });


        it(printTitle('trusted nodes', 'cannot submit a withdrawable event for a minipool twice'), async () => {

            // Set parameters
            let startBalance = web3.utils.toWei('32', 'ether');
            let endBalance = web3.utils.toWei('36', 'ether');

            // Submit withdrawable event for staking minipool
            await submitWithdrawable(stakingMinipool1.address, startBalance, endBalance, {
                from: trustedNode1,
            });

            // Attempt to submit withdrawable event for staking minipool again
            await shouldRevert(submitWithdrawable(stakingMinipool1.address, startBalance, endBalance, {
                from: trustedNode1,
            }), 'Submitted the same withdrawable event for a minipool twice');

        });


        it(printTitle('regular nodes', 'cannot submit a withdrawable event for a minipool'), async () => {

            // Set parameters
            let startBalance = web3.utils.toWei('32', 'ether');
            let endBalance = web3.utils.toWei('36', 'ether');

            // Attempt to submit withdrawable event for staking minipool
            await shouldRevert(submitWithdrawable(stakingMinipool1.address, startBalance, endBalance, {
                from: node,
            }), 'Regular node submitted a withdrawable event for a minipool');

        });


    });
}
