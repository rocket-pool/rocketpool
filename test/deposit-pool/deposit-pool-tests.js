import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getDepositSetting, setDepositSetting } from '../_helpers/settings';
import { deposit } from './scenarios-deposit';

export default function() {
    contract('RocketDepositPool', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const staker = accounts[1];


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        it(printTitle('staker', 'can make a deposit'), async () => {
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
            let depositAmount = web3.utils.toWei('0.0001', 'ether');
            let minimumDeposit = await getDepositSetting('MinimumDeposit');
            assert.isBelow(parseInt(depositAmount), parseInt(minimumDeposit), 'Deposit amount is not less than the minimum deposit');

            // Attempt deposit
            await shouldRevert(deposit({
                from: staker,
                value: depositAmount,
            }), 'Made a deposit below the minimum deposit amount');

        });


    });
}
