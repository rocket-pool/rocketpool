import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { setNetworkSetting } from '../_helpers/settings';
import { submitETHBalances } from './scenario-submit-balances';

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


        it(printTitle('trusted nodes', 'can submit network ETH balances'), async () => {

            // Set parameters
            let block = 1;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Submit different ETH balances
            await submitETHBalances(block, totalBalance, stakingBalance, web3.utils.toWei('7', 'ether'), {
                from: trustedNode1,
            });
            await submitETHBalances(block, totalBalance, stakingBalance, web3.utils.toWei('6', 'ether'), {
                from: trustedNode2,
            });
            await submitETHBalances(block, totalBalance, stakingBalance, web3.utils.toWei('5', 'ether'), {
                from: trustedNode3,
            });

            // Set parameters
            block = 2;

            // Submit identical ETH balances to trigger update
            await submitETHBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });
            await submitETHBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode2,
            });

        });


        it(printTitle('trusted nodes', 'cannot submit network ETH balances while balance submissions are disabled'), async () => {

            // Set parameters
            let block = 1;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Disable submissions
            await setNetworkSetting('SubmitBalancesEnabled', false, {from: owner});

            // Attempt to submit ETH balances
            await shouldRevert(submitETHBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            }), 'Submitted ETH balances while balance submissions were disabled');

        });


        it(printTitle('trusted nodes', 'cannot submit network ETH balances for the current block or lower'), async () => {

            // Set parameters
            let block = 2;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Submit ETH balances for block to trigger update
            await submitETHBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });
            await submitETHBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode2,
            });

            // Attempt to submit ETH balances for current block
            await shouldRevert(submitETHBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode3,
            }), 'Submitted ETH balances for the current block');

            // Attempt to submit ETH balances for lower block
            await shouldRevert(submitETHBalances(block - 1, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode3,
            }), 'Submitted ETH balances for a lower block');

        });


        it(printTitle('trusted nodes', 'cannot submit invalid network ETH balances'), async () => {

            // Set parameters
            let block = 1;
            let totalBalance = web3.utils.toWei('9', 'ether');
            let stakingBalance = web3.utils.toWei('10', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Submit ETH balances for block
            await shouldRevert(submitETHBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            }), 'Submitted invalid ETH balances');

        });


        it(printTitle('trusted nodes', 'cannot submit the same network ETH balances twice'), async () => {

            // Set parameters
            let block = 1;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Submit ETH balances for block
            await submitETHBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });

            // Attempt to submit ETH balances for block again
            await shouldRevert(submitETHBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            }), 'Submitted the same network ETH balances twice');

        });


        it(printTitle('regular nodes', 'cannot submit network ETH balances'), async () => {

            // Set parameters
            let block = 1;
            let totalBalance = web3.utils.toWei('10', 'ether');
            let stakingBalance = web3.utils.toWei('9', 'ether');
            let rethSupply = web3.utils.toWei('8', 'ether');

            // Attempt to submit ETH balances
            await shouldRevert(submitETHBalances(block, totalBalance, stakingBalance, rethSupply, {
                from: node,
            }), 'Regular node submitted network ETH balances');

        });


    });
}
