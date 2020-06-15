import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { updateTotalETHBalance, updateStakingETHBalance } from './scenarios-balances';

export default function() {
    contract('RocketNetworkBalances', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        it(printTitle('trusted node', 'can update the network ETH balances'), async () => {

            // Register trusted node
            await registerNode({from: node});
            await setNodeTrusted(node, {from: owner});

            // Update total ETH balance
            await updateTotalETHBalance(web3.utils.toBN(web3.utils.toWei('10', 'ether')), {
                from: node,
            });

            // Update staking ETH balance
            await updateStakingETHBalance(web3.utils.toBN(web3.utils.toWei('9', 'ether')), {
                from: node,
            });

        });


        it(printTitle('regular node', 'cannot update the network ETH balances'), async () => {

            // Register node
            await registerNode({from: node});

            // Attempt to update total ETH balance
            await shouldRevert(updateTotalETHBalance(web3.utils.toBN(web3.utils.toWei('10', 'ether')), {
                from: node,
            }), 'Regular node updated the network total ETH balance');

            // Attempt to update staking ETH balance
            await shouldRevert(updateStakingETHBalance(web3.utils.toBN(web3.utils.toWei('9', 'ether')), {
                from: node,
            }), 'Regular node updated the network staking ETH balance');

        });


    });
}
