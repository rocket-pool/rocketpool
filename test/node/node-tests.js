import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { setNodeSetting } from '../_helpers/settings';
import { registerNode } from './scenarios-register';

export default function() {
    contract('RocketNodeManager', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


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


    });
}
