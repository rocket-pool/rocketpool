import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { submitBalances } from './scenario-submit-balances';
import { RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts';
import { setDAONetworkBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';

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
            await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);
            await setNodeTrusted(trustedNode2, 'saas_2', 'node@home.com', owner);
            await setNodeTrusted(trustedNode3, 'saas_3', 'node@home.com', owner);

        });


        it(printTitle('trusted nodes', 'can submit network balances'), async () => {

            // Set parameters
            let block = 1;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Submit different balances
            await submitBalances(block, totalBalance, stakingBalance, web3.utils.toWei('7', 'ether'), {
                from: trustedNode1,
            });
            await submitBalances(block, totalBalance, stakingBalance, web3.utils.toWei('6', 'ether'), {
                from: trustedNode2,
            });
            await submitBalances(block, totalBalance, stakingBalance, web3.utils.toWei('5', 'ether'), {
                from: trustedNode3,
            });

            // Set parameters
            block = 2;

            // Submit identical balances to trigger update
            await submitBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });
            await submitBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode2,
            });

        });


        it(printTitle('trusted nodes', 'cannot submit network balances while balance submissions are disabled'), async () => {

            // Set parameters
            let block = 1;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Disable submissions
            await setDAONetworkBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.balances.enabled', false, {from: owner});

            // Attempt to submit balances
            await shouldRevert(submitBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            }), 'Submitted balances while balance submissions were disabled');

        });


        it(printTitle('trusted nodes', 'cannot submit network balances for the current block or lower'), async () => {

            // Set parameters
            let block = 2;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Submit balances for block to trigger update
            await submitBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });
            await submitBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode2,
            });

            // Attempt to submit balances for current block
            await shouldRevert(submitBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode3,
            }), 'Submitted balances for the current block');

            // Attempt to submit balances for lower block
            await shouldRevert(submitBalances(block - 1, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode3,
            }), 'Submitted balances for a lower block');

        });


        it(printTitle('trusted nodes', 'cannot submit invalid network balances'), async () => {

            // Set parameters
            let block = 1;
            let totalBalance = web3.utils.toWei('9', 'ether');
            let stakingBalance = web3.utils.toWei('10', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Submit balances for block
            await shouldRevert(submitBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            }), 'Submitted invalid balances');

        });


        it(printTitle('trusted nodes', 'cannot submit the same network balances twice'), async () => {

            // Set parameters
            let block = 1;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Submit balances for block
            await submitBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });

            // Attempt to submit balances for block again
            await shouldRevert(submitBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            }), 'Submitted the same network balances twice');

        });


        it(printTitle('regular nodes', 'cannot submit network balances'), async () => {

            // Set parameters
            let block = 1;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Attempt to submit balances
            await shouldRevert(submitBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: node,
            }), 'Regular node submitted network balances');

        });


    });
}
