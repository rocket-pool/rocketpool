import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode } from '../_helpers/node';
import { RocketDAOProtocolSettingsNode } from '../_utils/artifacts';
import { setDAONetworkBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { register } from './scenario-register';
import { setTimezoneLocation } from './scenario-set-timezone';


export default function() {
    contract('RocketNodeManager', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            registeredNode,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        before(async () => {

            // Register node
            await registerNode({from: registeredNode});

        });


        //
        // Registration
        //


        it(printTitle('node operator', 'can register a node'), async () => {

            // Register node
            await register('Australia/Brisbane', {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot register a node while registrations are disabled'), async () => {

            // Disable registrations
            await setDAONetworkBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.registration.enabled', false, {from: owner});

            // Attempt registration
            await shouldRevert(register('Australia/Brisbane', {
                from: node,
            }), 'Registered a node while registrations were disabled');

        });


        it(printTitle('node operator', 'cannot register a node with an invalid timezone location'), async () => {

            // Attempt to register node
            await shouldRevert(register('a', {
                from: node,
            }), 'Registered a node with an invalid timezone location');

        });


        it(printTitle('node operator', 'cannot register a node which is already registered'), async () => {

            // Register
            await register('Australia/Brisbane', {from: node});

            // Attempt second registration
            await shouldRevert(register('Australia/Brisbane', {
                from: node,
            }), 'Registered a node which is already registered');

        });


        //
        // Timezone location
        //


        it(printTitle('node operator', 'can set their timezone location'), async () => {

            // Set timezone location
            await setTimezoneLocation('Australia/Sydney', {
                from: registeredNode,
            });

        });


        it(printTitle('node operator', 'cannot set their timezone location to an invalid value'), async () => {

            // Attempt to set timezone location
            await shouldRevert(setTimezoneLocation('a', {
                from: registeredNode,
            }), 'Set a timezone location to an invalid value');

        });


        it(printTitle('random address', 'cannot set a timezone location'), async () => {

            // Attempt to set timezone location
            await shouldRevert(setTimezoneLocation('Australia/Brisbane', {
                from: random,
            }), 'Random address set a timezone location');

        });



    });
}
