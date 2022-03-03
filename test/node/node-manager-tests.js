import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode } from '../_helpers/node';
import { RocketDAOProtocolSettingsNode, RocketNodeManager } from '../_utils/artifacts'
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { register } from './scenario-register';
import { setTimezoneLocation } from './scenario-set-timezone';
import { setWithdrawalAddress, confirmWithdrawalAddress } from './scenario-set-withdrawal-address';
import { upgradeRewards } from '../_utils/upgrade';


export default function() {
    contract('RocketNodeManager', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            registeredNode1,
            registeredNode2,
            withdrawalAddress1,
            withdrawalAddress2,
            withdrawalAddress3,
            random,
            random2,
            random3,
        ] = accounts;


        // Setup
        before(async () => {
            // Upgrade
            await upgradeRewards(owner);

            // Register nodes
            await registerNode({from: registeredNode1});
            await registerNode({from: registeredNode2});

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
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.registration.enabled', false, {from: owner});

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
        // Withdrawal address
        //


        it(printTitle('node operator', 'can set their withdrawal address immediately'), async () => {

            // Set withdrawal address
            await setWithdrawalAddress(registeredNode1, withdrawalAddress1, true, {
                from: registeredNode1,
            });

            // Set withdrawal address again
            await setWithdrawalAddress(registeredNode1, withdrawalAddress2, true, {
                from: withdrawalAddress1,
            });

        });


        it(printTitle('node operator', 'can set their withdrawal address to the same value as another node operator'), async () => {

            // Set withdrawal addresses
            await setWithdrawalAddress(registeredNode1, withdrawalAddress1, true, {
                from: registeredNode1,
            });

            await setWithdrawalAddress(registeredNode2, withdrawalAddress1, true, {
                from: registeredNode2,
            });

            // Set withdrawal addresses again
            await setWithdrawalAddress(registeredNode1, withdrawalAddress2, true, {
                from: withdrawalAddress1,
            });

            await setWithdrawalAddress(registeredNode2, withdrawalAddress2, true, {
                from: withdrawalAddress1,
            });

        });


        it(printTitle('node operator', 'cannot set their withdrawal address to an invalid address'), async () => {

            // Attempt to set withdrawal address
            await shouldRevert(setWithdrawalAddress(registeredNode1, '0x0000000000000000000000000000000000000000', true, {
                from: registeredNode1,
            }), 'Set a withdrawal address to an invalid address');

        });


        it(printTitle('random address', 'cannot set a withdrawal address'), async () => {

            // Attempt to set withdrawal address
            await shouldRevert(setWithdrawalAddress(registeredNode1, withdrawalAddress1, true, {
                from: random,
            }), 'Random address set a withdrawal address');

        });


        it(printTitle('node operator', 'can set and confirm their withdrawal address'), async () => {

            // Set & confirm withdrawal address
            await setWithdrawalAddress(registeredNode1, withdrawalAddress1, false, {
                from: registeredNode1,
            });
            await confirmWithdrawalAddress(registeredNode1, {
                from: withdrawalAddress1,
            });

            // Set & confirm withdrawal address again
            await setWithdrawalAddress(registeredNode1, withdrawalAddress2, false, {
                from: withdrawalAddress1,
            });
            await confirmWithdrawalAddress(registeredNode1, {
                from: withdrawalAddress2,
            });

        });


        it(printTitle('random address', 'cannot confirm itself as a withdrawal address'), async () => {

            // Attempt to confirm a withdrawal address
            await shouldRevert(confirmWithdrawalAddress(registeredNode1, {
                from: random,
            }), 'Random address confirmed itself as a withdrawal address');

        });


        //
        // Timezone location
        //


        it(printTitle('node operator', 'can set their timezone location'), async () => {

            // Set timezone location
            await setTimezoneLocation('Australia/Sydney', {
                from: registeredNode1,
            });

        });


        it(printTitle('node operator', 'cannot set their timezone location to an invalid value'), async () => {

            // Attempt to set timezone location
            await shouldRevert(setTimezoneLocation('a', {
                from: registeredNode1,
            }), 'Set a timezone location to an invalid value');

        });


        it(printTitle('random address', 'cannot set a timezone location'), async () => {

            // Attempt to set timezone location
            await shouldRevert(setTimezoneLocation('Australia/Brisbane', {
                from: random,
            }), 'Random address set a timezone location');

        });


        //
        // Misc
        //


        it(printTitle('random', 'can query timezone counts'), async () => {

            const rocketNodeManager = await RocketNodeManager.deployed();
            await rocketNodeManager.registerNode('Australia/Sydney', {from: random2});
            await rocketNodeManager.registerNode('Australia/Perth', {from: random3});

            const timezones = await rocketNodeManager.getNodeCountPerTimezone(0, 0)

            const expects = {
                'Australia/Brisbane': 2,
                'Australia/Sydney': 1,
                'Australia/Perth': 1,
            }

            for (const expectTimezone in expects) {
              const actual = timezones.find(tz => tz.timezone === expectTimezone)
              assert(actual && Number(actual.count) === expects[expectTimezone], "Timezone count was incorrect for " + expectTimezone + ", expected " + expects[expectTimezone] + " but got " + actual);
            }
        });
    });
}
