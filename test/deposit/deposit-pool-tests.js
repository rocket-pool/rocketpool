import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getTotalETHBalance, updateTotalETHBalance } from '../_helpers/network';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { getDepositSetting, setDepositSetting } from '../_helpers/settings';
import { deposit } from './scenarios-deposit';

export default function() {
    contract('RocketDepositPool', async (accounts) => {


        // Accounts
        const [
            owner,
            staker,
            node,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        it(printTitle('staker', 'can make a deposit'), async () => {

            // Deposit
            await deposit({
                from: staker,
                value: web3.utils.toWei('10', 'ether'),
            });

            // Create trusted node
            await registerNode({from: node});
            await setNodeTrusted(node, {from: owner});

            // Update network ETH total to 133% to alter rETH exchange rate
            let balance = await getTotalETHBalance();
            balance = balance.mul(web3.utils.toBN(4)).div(web3.utils.toBN(3));
            await updateTotalETHBalance(balance, {from: node});

            // Deposit again with updated rETH exchange rate
            await deposit({
                from: staker,
                value: web3.utils.toWei('10', 'ether'),
            });

        });


        it(printTitle('staker', 'cannot make a deposit while deposits are disabled'), async () => {

            // Disable deposits
            await setDepositSetting('DepositEnabled', false, {from: owner});

            // Attempt deposit
            await shouldRevert(deposit({
                from: staker,
                value: web3.utils.toWei('10', 'ether'),
            }), 'Made a deposit while deposits are disabled');

        });


        it(printTitle('staker', 'cannot make a deposit below the minimum deposit amount'), async () => {

            // Get & check deposit amount
            let minimumDeposit = await getDepositSetting('MinimumDeposit');
            let depositAmount = minimumDeposit.div(web3.utils.toBN(2));
            assert(depositAmount.lt(minimumDeposit), 'Deposit amount is not less than the minimum deposit');

            // Attempt deposit
            await shouldRevert(deposit({
                from: staker,
                value: depositAmount,
            }), 'Made a deposit below the minimum deposit amount');

        });


    });
}
