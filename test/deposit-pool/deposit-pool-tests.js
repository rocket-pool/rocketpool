import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { setDepositSetting } from '../_helpers/settings';
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
            await setDepositSetting({setting: 'DepositEnabled', value: false, from: owner});
            await shouldRevert(deposit({
                from: staker,
                value: web3.utils.toWei('10', 'ether'),
            }), 'Made a deposit while deposits are disabled');
        });


    });
}
