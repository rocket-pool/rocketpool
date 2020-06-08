import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { setNodeSetting } from '../_helpers/settings';
import { registerNode } from './scenarios-register';
import { setTimezoneLocation } from './scenarios-timezone';
import { setNodeTrusted } from './scenarios-trusted';

export default function() {
    contract('RocketNodeManager', async (accounts) => {


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


        //
        // Registration
        //


        it(printTitle('node operator', 'can register a node'), async () => {
            await registerNode('Australia/Brisbane', {
                from: node,
            });
        });


        it(printTitle('node operator', 'cannot register a node while registrations are disabled'), async () => {

            // Disable registrations
            await setNodeSetting('RegistrationEnabled', false, {from: owner});

            // Attempt registration
            await shouldRevert(registerNode('Australia/Brisbane', {
                from: node,
            }), 'Registered a node while registrations were disabled');

        });


        it(printTitle('node operator', 'cannot register a node with a balance below the minimum'), async () => {

            // Set minimum balance above account balance
            let nodeBalance = await web3.eth.getBalance(node);
            let minimumBalance = web3.utils.toBN(nodeBalance).mul(web3.utils.toBN(2));
            await setNodeSetting('MinimumBalance', minimumBalance, {from: owner});

            // Attempt registration
            await shouldRevert(registerNode('Australia/Brisbane', {
                from: node,
            }), 'Registered a node with a balance below the minimum');

        });


        it(printTitle('node operator', 'cannot register a node with an invalid timezone location'), async () => {
            await shouldRevert(registerNode('a', {
                from: node,
            }), 'Registered a node with an invalid timezone location');
        });


        it(printTitle('node operator', 'cannot register a node which is already registered'), async () => {

            // Register
            await registerNode('Australia/Brisbane', {
                from: node,
            });

            // Attempt second registration
            await shouldRevert(registerNode('Australia/Brisbane', {
                from: node,
            }), 'Registered a node which is already registered');

        });


        //
        // Timezone location
        //


        it(printTitle('node operator', 'can set their timezone location'), async () => {

            // Register
            await registerNode('Australia/Brisbane', {from: node});

            // Set timezone location
            await setTimezoneLocation('Australia/Sydney', {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot set their timezone location to an invalid value'), async () => {

            // Register
            await registerNode('Australia/Brisbane', {from: node});

            // Attempt to set timezone location
            await shouldRevert(setTimezoneLocation('a', {
                from: node,
            }), 'Set a timezone location to an invalid value');

        });


        it(printTitle('random address', 'cannot set a timezone location'), async () => {

            // Attempt to set timezone location
            await shouldRevert(setTimezoneLocation('Australia/Brisbane', {
                from: random,
            }), 'Random address set a timezone location');

        });


        //
        // Trusted status
        //


        it(printTitle('admin', 'can set a node\'s trusted status'), async () => {

            // Register
            await registerNode('Australia/Brisbane', {from: node});

            // Set trusted status
            await setNodeTrusted(node, true, {from: owner});
            await setNodeTrusted(node, false, {from: owner});

        });


        it(printTitle('admin', 'cannot set trusted status for an invalid node'), async () => {

            // Register
            await registerNode('Australia/Brisbane', {from: node});

            // Attempt to set trusted status
            await shouldRevert(setNodeTrusted(random, true, {
                from: owner,
            }), 'Set trusted status for an invalid node');

        });


        it(printTitle('admin', 'cannot set a node\'s trusted status to its current trusted status'), async () => {

            // Register
            await registerNode('Australia/Brisbane', {from: node});

            // Attempt to set trusted status
            await shouldRevert(setNodeTrusted(node, false, {
                from: owner,
            }), 'Set a node\'s trusted status to its current trusted status');
            await setNodeTrusted(node, true, {from: owner});
            await shouldRevert(setNodeTrusted(node, true, {
                from: owner,
            }), 'Set a node\'s trusted status to its current trusted status');

        });


        it(printTitle('random address', 'cannot set a node\'s trusted status'), async () => {

            // Register
            await registerNode('Australia/Brisbane', {from: node});

            // Attempt to set trusted status
            await shouldRevert(setNodeTrusted(node, true, {
                from: random,
            }), 'Random address set a node\'s trusted status');

        });


    });
}
