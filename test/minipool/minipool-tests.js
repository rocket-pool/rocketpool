import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { userDeposit } from '../_helpers/deposit';
import { getMinipoolMinimumRPLStake, createMinipool, stakeMinipool, submitMinipoolWithdrawable, dissolveMinipool } from '../_helpers/minipool';
import { getWithdrawalCredentials } from '../_helpers/network';
import { registerNode, setNodeTrusted, setNodeWithdrawalAddress, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { close } from './scenario-close';
import { dissolve } from './scenario-dissolve';
import { refund } from './scenario-refund';
import { stake } from './scenario-stake';
import { withdraw } from './scenario-withdraw';
import { RocketDAOProtocolSettingsMinipool } from '../_utils/artifacts';
import { setDAONetworkBootstrapSetting } from '../dao/scenario-dao-network-bootstrap';

export default function() {
    contract('RocketMinipool', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            nodeWithdrawalAddress,
            trustedNode,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let launchTimeout = 20;
        let withdrawalDelay = 20;
        let withdrawalCredentials;
        let initializedMinipool;
        let prelaunchMinipool;
        let prelaunchMinipool2;
        let stakingMinipool;
        let withdrawableMinipool;
        let dissolvedMinipool;
        before(async () => {

            // Register node & set withdrawal address
            await registerNode({from: node});
            await setNodeWithdrawalAddress(nodeWithdrawalAddress, {from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Set settings
            await setDAONetworkBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, {from: owner});
            await setDAONetworkBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, {from: owner});

            // Get network settings
            withdrawalCredentials = await getWithdrawalCredentials();

            // Make user deposit to refund first prelaunch minipool
            let refundAmount = web3.utils.toWei('16', 'ether');
            await userDeposit({from: random, value: refundAmount});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(web3.utils.toBN(6));
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Create minipools
            prelaunchMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            prelaunchMinipool2 = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            stakingMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            withdrawableMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            initializedMinipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            dissolvedMinipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            await stakeMinipool(stakingMinipool, null, {from: node});
            await stakeMinipool(withdrawableMinipool, null, {from: node});
            await submitMinipoolWithdrawable(withdrawableMinipool.address, web3.utils.toWei('32', 'ether'), web3.utils.toWei('36', 'ether'), {from: trustedNode});
            await dissolveMinipool(dissolvedMinipool, {from: node});

            // Check minipool statuses
            let initializedStatus = await initializedMinipool.getStatus.call();
            let prelaunchStatus = await prelaunchMinipool.getStatus.call();
            let prelaunch2Status = await prelaunchMinipool2.getStatus.call();
            let stakingStatus = await stakingMinipool.getStatus.call();
            let withdrawableStatus = await withdrawableMinipool.getStatus.call();
            let dissolvedStatus = await dissolvedMinipool.getStatus.call();
            assert(initializedStatus.eq(web3.utils.toBN(0)), 'Incorrect initialized minipool status');
            assert(prelaunchStatus.eq(web3.utils.toBN(1)), 'Incorrect prelaunch minipool status');
            assert(prelaunch2Status.eq(web3.utils.toBN(1)), 'Incorrect prelaunch minipool status');
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            assert(withdrawableStatus.eq(web3.utils.toBN(3)), 'Incorrect withdrawable minipool status');
            assert(dissolvedStatus.eq(web3.utils.toBN(4)), 'Incorrect dissolved minipool status');

            // Check minipool refund balances
            let prelaunchRefundBalance = await prelaunchMinipool.getNodeRefundBalance.call();
            let prelaunch2RefundBalance = await prelaunchMinipool2.getNodeRefundBalance.call();
            assert(prelaunchRefundBalance.eq(web3.utils.toBN(refundAmount)), 'Incorrect prelaunch minipool refund balance');
            assert(prelaunch2RefundBalance.eq(web3.utils.toBN(0)), 'Incorrect prelaunch minipool refund balance');

        });


        //
        // Refund
        //


        it(printTitle('node operator', 'can refund a refinanced node deposit balance'), async () => {

            // Refund from minipool with refund balance
            await refund(prelaunchMinipool, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot refund with no refinanced node deposit balance'), async () => {

            // Refund
            await refund(prelaunchMinipool, {from: node});

            // Attempt refund from minipools with no refund balance
            await shouldRevert(refund(prelaunchMinipool, {
                from: node,
            }), 'Refunded from a minipool which was already refunded from');
            await shouldRevert(refund(prelaunchMinipool2, {
                from: node,
            }), 'Refunded from a minipool with no refund balance');

        });


        it(printTitle('random address', 'cannot refund a refinanced node deposit balance'), async () => {

            // Attempt refund from minipool with refund balance
            await shouldRevert(refund(prelaunchMinipool, {
                from: random,
            }), 'Random address refunded from a minipool');

        });


        //
        // Dissolve
        //


        it(printTitle('node operator', 'can dissolve their own minipools'), async () => {

            // Dissolve minipools
            await dissolve(initializedMinipool, {
                from: node,
            });
            await dissolve(prelaunchMinipool, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot dissolve their own staking minipools'), async () => {

            // Attempt to dissolve staking minipool
            await shouldRevert(dissolve(stakingMinipool, {
                from: node,
            }), 'Dissolved a staking minipool');

        });


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
            }), 'Random address dissolved a minipool which was not at prelaunch');

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


        it(printTitle('node operator', 'can stake a minipool at prelaunch'), async () => {

            // Stake prelaunch minipool
            await stake(prelaunchMinipool, getValidatorPubkey(), withdrawalCredentials, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot stake a minipool which is not at prelaunch'), async () => {

            // Attempt to stake initialized minipool
            await shouldRevert(stake(initializedMinipool, getValidatorPubkey(), withdrawalCredentials, {
                from: node,
            }), 'Staked a minipool which was not at prelaunch');

        });


        it(printTitle('node operator', 'cannot stake a minipool with a reused validator pubkey'), async () => {

            // Get pubkey
            let pubkey = getValidatorPubkey();

            // Stake prelaunch minipool
            await stake(prelaunchMinipool, pubkey, withdrawalCredentials, {from: node});

            // Attempt to stake second prelaunch minipool with same pubkey
            await shouldRevert(stake(prelaunchMinipool2, pubkey, withdrawalCredentials, {
                from: node,
            }), 'Staked a minipool with a reused validator pubkey');

        });


        it(printTitle('node operator', 'cannot stake a minipool with incorrect withdrawal credentials'), async () => {

            // Get withdrawal credentials
            let invalidWithdrawalCredentials = '0x1111111111111111111111111111111111111111111111111111111111111111';
            assert.notEqual(invalidWithdrawalCredentials, withdrawalCredentials, 'Withdrawal credentials are not incorrect');

            // Attempt to stake prelaunch minipool
            await shouldRevert(stake(prelaunchMinipool, getValidatorPubkey(), invalidWithdrawalCredentials, {
                from: node,
            }), 'Staked a minipool with incorrect withdrawal credentials');

        });


        it(printTitle('random address', 'cannot stake a minipool'), async () => {

            // Attempt to stake prelaunch minipool
            await shouldRevert(stake(prelaunchMinipool, getValidatorPubkey(), withdrawalCredentials, {
                from: random,
            }), 'Random address staked a minipool');

        });


        //
        // Withdraw
        //


        it(printTitle('node operator', 'can withdraw a withdrawable minipool after withdrawal delay'), async () => {

            // Wait for withdrawal delay
            await mineBlocks(web3, withdrawalDelay);

            // Withdraw withdrawable minipool
            await withdraw(withdrawableMinipool, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot withdraw a minipool which is not withdrawable'), async () => {

            // Wait for withdrawal delay
            await mineBlocks(web3, withdrawalDelay);

            // Attempt to withdraw staking minipool
            await shouldRevert(withdraw(stakingMinipool, {
                from: node,
            }), 'Withdrew a minipool which was not withdrawable');

        });


        it(printTitle('node operator', 'cannot withdraw a withdrawable minipool before withdrawal delay'), async () => {

            // Attempt to withdraw withdrawable minipool
            await shouldRevert(withdraw(withdrawableMinipool, {
                from: node,
            }), 'Withdrew a minipool before withdrawal delay');

        });


        it(printTitle('random address', 'cannot withdraw a minipool'), async () => {

            // Wait for withdrawal delay
            await mineBlocks(web3, withdrawalDelay);

            // Attempt to withdraw withdrawable minipool
            await shouldRevert(withdraw(withdrawableMinipool, {
                from: random,
            }), 'Random address withdrew a minipool');

        });


        //
        // Close
        //


        it(printTitle('node operator', 'can close a dissolved minipool'), async () => {

            // Close dissolved minipool
            await close(dissolvedMinipool, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot close a minipool which is not dissolved'), async () => {

            // Attempt to close staking minipool
            await shouldRevert(close(stakingMinipool, {
                from: node,
            }), 'Closed a minipool which was not dissolved');

        });


        it(printTitle('random address', 'cannot close a dissolved minipool'), async () => {

            // Attempt to close dissolved minipool
            await shouldRevert(close(dissolvedMinipool, {
                from: random,
            }), 'Random address closed a minipool');

        });


    });
}
