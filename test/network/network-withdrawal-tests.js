import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { getMinipoolMinimumRPLStake, createMinipool, stakeMinipool, submitMinipoolWithdrawable } from '../_helpers/minipool';
import { registerNode, setNodeTrusted, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { setSystemWithdrawalContractAddress } from './scenario-set-swc-address';
import { RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';

export default function() {
    contract('RocketNetworkWithdrawal', async (accounts) => {


        // Accounts
        const [
            owner,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        //
        // Set system withdrawal contract address
        //


        it(printTitle('admin', 'can set the system withdrawal contract address'), async () => {

            // SWC address
            const swcAddress = '0x1111111111111111111111111111111111111111';

            // Set SWC address
            await setSystemWithdrawalContractAddress(swcAddress, {
                from: owner,
            });

        });


        it(printTitle('random address', 'cannot set the system withdrawal contract address'), async () => {

            // SWC address
            const swcAddress = '0x1111111111111111111111111111111111111111';

            // Set SWC address
            await shouldRevert(setSystemWithdrawalContractAddress(swcAddress, {
                from: random,
            }), 'Random address set the system withdrawal contract address');

        });


    });
}
