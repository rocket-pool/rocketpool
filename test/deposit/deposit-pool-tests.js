import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getTotalETHBalance, updateETHBalances } from '../_helpers/network';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { getRethExchangeRate } from '../_helpers/tokens';
import { getDepositSetting, setDepositSetting } from '../_helpers/settings';
import { assignDeposits } from './scenarios-assign';
import { deposit } from './scenarios-deposit';

export default function() {
    contract('RocketDepositPool', async (accounts) => {


        // Accounts
        const [
            owner,
            trustedNode,
            staker,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        before(async () => {

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

        });


        //
        // Deposit
        //


        it(printTitle('staker', 'can make a deposit'), async () => {

            // Deposit
            await deposit({
                from: staker,
                value: web3.utils.toWei('10', 'ether'),
            });

            // Get current rETH exchange rate
            let exchangeRate1 = await getRethExchangeRate();

            // Update network ETH total to 133% to alter rETH exchange rate
            let balance = await getTotalETHBalance();
            balance = balance.mul(web3.utils.toBN(4)).div(web3.utils.toBN(3));
            await updateETHBalances(balance, 0, {from: trustedNode});

            // Get & check updated rETH exchange rate
            let exchangeRate2 = await getRethExchangeRate();
            assert(!exchangeRate1.eq(exchangeRate2), 'rETH exchange rate has not changed');

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


        //
        // Assign deposits
        //


        it(printTitle('random address', 'can assign deposits'), async () => {

            // Assign deposits
            await assignDeposits({
                from: staker,
            });

        });


        it(printTitle('random address', 'cannot assign deposits while deposit assignment is disabled'), async () => {

            // Disable deposits
            await setDepositSetting('AssignDepositsEnabled', false, {from: owner});

            // Attempt to assign deposits
            await shouldRevert(assignDeposits({
                from: staker,
            }), 'Assigned deposits while deposit assignment is disabled');

        });


    });
}
