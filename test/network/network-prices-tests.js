import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { submitPrices } from './scenario-submit-prices';
import { RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';

export default function() {
    contract('RocketNetworkPrices', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode1,
            trustedNode2,
            trustedNode3,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted nodes
            await registerNode({from: trustedNode1});
            await registerNode({from: trustedNode2});
            await registerNode({from: trustedNode3});
            await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);
            await setNodeTrusted(trustedNode2, 'saas_2', 'node@home.com', owner);
            await setNodeTrusted(trustedNode3, 'saas_3', 'node@home.com', owner);

        });


        it(printTitle('trusted nodes', 'can submit network prices'), async () => {

            // Set parameters
            let block = 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Submit different prices
            await submitPrices(block, web3.utils.toWei('0.03', 'ether'), {
                from: trustedNode1,
            });
            await submitPrices(block, web3.utils.toWei('0.04', 'ether'), {
                from: trustedNode2,
            });
            await submitPrices(block, web3.utils.toWei('0.05', 'ether'), {
                from: trustedNode3,
            });

            // Set parameters
            block = 2;

            // Submit identical prices to trigger update
            await submitPrices(block, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, rplPrice, {
                from: trustedNode2,
            });

        });


        it(printTitle('trusted nodes', 'cannot submit network prices while price submissions are disabled'), async () => {

            // Set parameters
            let block = 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Disable submissions
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.enabled', false, {from: owner});

            // Attempt to submit prices
            await shouldRevert(submitPrices(block, rplPrice, {
                from: trustedNode1,
            }), 'Submitted prices while price submissions were disabled');

        });


        it(printTitle('trusted nodes', 'cannot submit network prices for a future block'), async () => {

            // Get current block
            let blockCurrent = await web3.eth.getBlockNumber();

            // Set parameters
            let block = blockCurrent + 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Attempt to submit prices for future block
            await shouldRevert(submitPrices(block, rplPrice, {
                from: trustedNode1,
            }), 'Submitted prices for a future block');

        });


        it(printTitle('trusted nodes', 'cannot submit network prices for the current recorded block or lower'), async () => {

            // Set parameters
            let block = 2;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Submit prices for block to trigger update
            await submitPrices(block, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, rplPrice, {
                from: trustedNode2,
            });

            // Attempt to submit prices for current block
            await shouldRevert(submitPrices(block, rplPrice, {
                from: trustedNode3,
            }), 'Submitted prices for the current block');

            // Attempt to submit prices for lower block
            await shouldRevert(submitPrices(block - 1, rplPrice, {
                from: trustedNode3,
            }), 'Submitted prices for a lower block');

        });


        it(printTitle('trusted nodes', 'cannot submit the same network prices twice'), async () => {

            // Set parameters
            let block = 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Submit prices for block
            await submitPrices(block, rplPrice, {
                from: trustedNode1,
            });

            // Attempt to submit prices for block again
            await shouldRevert(submitPrices(block, rplPrice, {
                from: trustedNode1,
            }), 'Submitted the same network prices twice');

        });


        it(printTitle('regular nodes', 'cannot submit network prices'), async () => {

            // Set parameters
            let block = 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Attempt to submit prices
            await shouldRevert(submitPrices(block, rplPrice, {
                from: node,
            }), 'Regular node submitted network prices');

        });


    });
}
