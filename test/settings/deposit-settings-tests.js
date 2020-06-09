import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { setDepositSetting } from './scenarios-settings';

export default function() {
    contract('RocketDepositSettings', async (accounts) => {


        // Accounts
        const [
            owner,
            random,
        ] = accounts;


        // Settings
        const settings = {
            'DepositEnabled':             false,
            'AssignDepositsEnabled':      false,
            'MinimumDeposit':             web3.utils.toBN(web3.utils.toWei('10', 'ether')),
            'MaximumDepositAssignments':  web3.utils.toBN(100),
        };


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        it(printTitle('admin', 'can update the deposit settings'), async () => {
            for (let setting in settings) {
                let value = settings[setting];
                await setDepositSetting(setting, value, {
                    from: owner,
                });
            }
        });


        it(printTitle('random address', 'cannot update the deposit settings'), async () => {
            for (let setting in settings) {
                let value = settings[setting];
                await shouldRevert(setDepositSetting(setting, value, {
                    from: random,
                }), 'Random address updated a deposit setting');
            }
        });


    });
}
