import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { setNodeSetting } from './scenarios-settings';

export default function() {
    contract('RocketNodeSettings', async (accounts) => {


        // Accounts
        const [
            owner,
            random,
        ] = accounts;


        // Settings
        const settings = {
            'RegistrationEnabled':  false,
            'DepositEnabled':       false,
        };


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        it(printTitle('admin', 'can update the node settings'), async () => {
            for (let setting in settings) {
                let value = settings[setting];
                await setNodeSetting(setting, value, {
                    from: owner,
                });
            }
        });


        it(printTitle('random address', 'cannot update the node settings'), async () => {
            for (let setting in settings) {
                let value = settings[setting];
                await shouldRevert(setNodeSetting(setting, value, {
                    from: random,
                }), 'Random address updated a node setting');
            }
        });


    });
}
