import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { setNetworkSetting } from './scenarios-settings';

export default function() {
    contract('RocketNetworkSettings', async (accounts) => {


        // Accounts
        const [
            owner,
            random,
        ] = accounts;


        // Settings
        const settings = {
            'NodeConsensusThreshold':     web3.utils.toBN(web3.utils.toWei('0.76', 'ether')),
            'SubmitBalancesEnabled':      false,
            'SubmitBalancesFrequency':    web3.utils.toBN(20),
            'ProcessWithdrawalsEnabled':  false,
            'MinimumNodeFee':             web3.utils.toBN(web3.utils.toWei('0.30', 'ether')),
            'TargetNodeFee':              web3.utils.toBN(web3.utils.toWei('0.40', 'ether')),
            'MaximumNodeFee':             web3.utils.toBN(web3.utils.toWei('0.50', 'ether')),
            'NodeFeeDemandRange':         web3.utils.toBN(web3.utils.toWei('50', 'ether')),
            'TargetRethCollateralRate':   web3.utils.toBN(web3.utils.toWei('0.5', 'ether')),
        };


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        it(printTitle('admin', 'can update the network settings'), async () => {
            for (let setting in settings) {
                let value = settings[setting];
                await setNetworkSetting(setting, value, {
                    from: owner,
                });
            }
        });


        it(printTitle('random address', 'cannot update the network settings'), async () => {
            for (let setting in settings) {
                let value = settings[setting];
                await shouldRevert(setNetworkSetting(setting, value, {
                    from: random,
                }), 'Random address updated a network setting');
            }
        });


    });
}
