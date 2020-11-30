import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode } from '../_helpers/node';
import { register } from './scenario-register';
import { setNodeTrusted } from './scenario-set-trusted';

export default function() {
    contract('RocketNodeTrustedDAO', async (accounts) => {


        // Accounts
        const [
            owner,
            userOne,
            userTwo,
            registeredNode1,
            registeredNode2,
            registeredNodeTrusted1,
            registeredNodeTrusted2,
            registeredNodeTrusted3,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        before(async () => {

            // Register nodes
            await registerNode({from: registeredNode1});
            await registerNode({from: registeredNode2});
            await registerNode({from: registeredNodeTrusted1});
            await registerNode({from: registeredNodeTrusted2});
            await registerNode({from: registeredNodeTrusted3});
            // Enable last node to be trusted
            await setNodeTrusted(registeredNodeTrusted1, true, {from: owner});
            await setNodeTrusted(registeredNodeTrusted2, true, {from: owner});
            await setNodeTrusted(registeredNodeTrusted3, true, {from: owner});

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


    });
}
