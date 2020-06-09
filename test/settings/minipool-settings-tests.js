import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { setMinipoolSetting } from './scenarios-settings';

export default function() {
    contract('RocketMinipoolSettings', async (accounts) => {


        // Accounts
        const [
            owner,
            random,
        ] = accounts;


        // Settings
        const settings = {
            'LaunchBalance':  web3.utils.toBN(web3.utils.toWei('100', 'ether')),
            'LaunchTimeout':  web3.utils.toBN(3600),
        };


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        it(printTitle('admin', 'can update the minipool settings'), async () => {
            for (let setting in settings) {
                let value = settings[setting];
                await setMinipoolSetting(setting, value, {
                    from: owner,
                });
            }
        });


        it(printTitle('random address', 'cannot update the minipool settings'), async () => {
            for (let setting in settings) {
                let value = settings[setting];
                await shouldRevert(setMinipoolSetting(setting, value, {
                    from: random,
                }), 'Random address updated a minipool setting');
            }
        });


    });
}
