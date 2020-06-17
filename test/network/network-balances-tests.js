import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { updateETHBalances } from './scenarios-balances';

export default function() {
    contract('RocketNetworkBalances', async (accounts) => {


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
            await setNodeTrusted(trustedNode1, {from: owner});
            await setNodeTrusted(trustedNode2, {from: owner});
            await setNodeTrusted(trustedNode3, {from: owner});

        });


        it(printTitle('trusted node', 'can update the network ETH balances'), async () => {

            // Get parameters
            let epoch = 1;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');

            // Update ETH balances
            await updateETHBalances(epoch, totalBalance, stakingBalance, {
                from: trustedNode1,
            });

        });


        it(printTitle('regular node', 'cannot update the network ETH balances'), async () => {

            // Get parameters
            let epoch = 1;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');

            // Attempt to update ETH balances
            await shouldRevert(updateETHBalances(epoch, totalBalance, stakingBalance, {
                from: node,
            }), 'Regular node updated the network ETH balances');

        });


    });
}
