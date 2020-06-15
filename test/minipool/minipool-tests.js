import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { createMinipool } from '../_helpers/minipool';
import { getWithdrawalCredentials } from '../_helpers/network';
import { registerNode } from '../_helpers/node';
import { setMinipoolSetting } from '../_helpers/settings';
import { dissolve } from './scenarios-dissolve';
import { stake } from './scenarios-stake';

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


        // Get / set settings
        let launchTimeout = 10;
        let withdrawalCredentials;
        before(async () => {
            await setMinipoolSetting('LaunchTimeout', launchTimeout, {from: owner});
            withdrawalCredentials = await getWithdrawalCredentials();
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


        it(printTitle('node operator', 'cannot dissolve their own minipool which has begun staking'), async () => {

            // Stake prelaunch minipool
            await stake(prelaunchMinipool, getValidatorPubkey(), withdrawalCredentials, {from: node});

            // Attempt to dissolve staking minipool
            await shouldRevert(dissolve(prelaunchMinipool, {
                from: node,
            }), 'Dissolved a minipool which had begun staking');

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
            await stake(prelaunchMinipool, pubkey, withdrawalCredentials, {
                from: node,
            });

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


        //
        // Close
        //


    });
}
