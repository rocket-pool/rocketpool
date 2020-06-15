import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { createMinipool, stakeMinipool, exitMinipool, withdrawMinipool } from '../_helpers/minipool';
import { getWithdrawalCredentials } from '../_helpers/network';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { setMinipoolSetting } from '../_helpers/settings';
import { close } from './scenarios-close';
import { dissolve } from './scenarios-dissolve';
import { stake } from './scenarios-stake';

export default function() {
    contract('RocketMinipool', async (accounts) => {


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
        let launchTimeout = 20;
        let withdrawalDelay = 20;
        let withdrawalCredentials;
        let initializedMinipool;
        let prelaunchMinipool;
        let stakingMinipool;
        let withdrawableMinipool;
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

            // Set settings
            await setMinipoolSetting('LaunchTimeout', launchTimeout, {from: owner});
            await setMinipoolSetting('WithdrawalDelay', withdrawalDelay, {from: owner});

            // Get network settings
            withdrawalCredentials = await getWithdrawalCredentials();

            // Create minipools
            initializedMinipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            prelaunchMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            stakingMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            withdrawableMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});

            // Stake minipools
            await stakeMinipool(stakingMinipool, {from: node});
            await stakeMinipool(withdrawableMinipool, {from: node});

            // Withdraw minipool
            await exitMinipool(withdrawableMinipool.address, {from: trustedNode});
            await withdrawMinipool(withdrawableMinipool.address, web3.utils.toWei('36', 'ether'), {from: trustedNode});

            // Check minipool statuses
            let initializedStatus = await initializedMinipool.getStatus.call();
            let prelaunchStatus = await prelaunchMinipool.getStatus.call();
            let stakingStatus = await stakingMinipool.getStatus.call();
            let withdrawableStatus = await withdrawableMinipool.getStatus.call();
            assert(initializedStatus.eq(web3.utils.toBN(0)), 'Incorrect initialized minipool status');
            assert(prelaunchStatus.eq(web3.utils.toBN(1)), 'Incorrect prelaunch minipool status');
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            assert(withdrawableStatus.eq(web3.utils.toBN(4)), 'Incorrect withdrawable minipool status');

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
            }), 'Staked a minipool which is not at prelaunch');

        });


        it(printTitle('node operator', 'cannot stake a minipool with a reused validator pubkey'), async () => {

            // Get pubkey
            let pubkey = getValidatorPubkey();

            // Stake prelaunch minipool
            await stake(prelaunchMinipool, pubkey, withdrawalCredentials, {from: node});

            // Create new prelaunch minipool
            let newPrelaunchMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});

            // Check created prelaunch minipool status
            let newPrelaunchStatus = await newPrelaunchMinipool.getStatus.call();
            assert(newPrelaunchStatus.eq(web3.utils.toBN(1)), 'Incorrect prelaunch minipool status');

            // Attempt to stake new prelaunch minipool with same validator pubkey
            await shouldRevert(stake(newPrelaunchMinipool, pubkey, withdrawalCredentials, {
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
        // Close
        //


        it(printTitle('node operator', 'can close a withdrawable minipool after withdrawal delay'), async () => {

            // Wait for withdrawal delay
            await mineBlocks(web3, withdrawalDelay);

            // Close withdrawable minipool
            await close(withdrawableMinipool, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot close a minipool which is not withdrawable'), async () => {

            // Wait for withdrawal delay
            await mineBlocks(web3, withdrawalDelay);

            // Attempt to close staking minipool
            await shouldRevert(close(stakingMinipool, {
                from: node,
            }), 'Closed a minipool which is not withdrawable');

        });


        it(printTitle('node operator', 'cannot close a withdrawable minipool before withdrawal delay'), async () => {

            // Attempt to close withdrawable minipool
            await shouldRevert(close(withdrawableMinipool, {
                from: node,
            }), 'Closed a minipool before withdrawal delay');

        });


        it(printTitle('random address', 'cannot close a minipool'), async () => {

            // Wait for withdrawal delay
            await mineBlocks(web3, withdrawalDelay);

            // Attempt to close withdrawable minipool
            await shouldRevert(close(withdrawableMinipool, {
                from: random,
            }), 'Random address closed a minipool');

        });


    });
}
