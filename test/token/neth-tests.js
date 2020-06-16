import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { createMinipool, stakeMinipool, exitMinipool, withdrawMinipool, closeMinipool } from '../_helpers/minipool';
import { withdrawValidator } from '../_helpers/network';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { setMinipoolSetting } from '../_helpers/settings';
import { getNethBalance } from '../_helpers/tokens';
import { burnNeth } from './scenarios-burn';

export default function() {
    contract('RocketNodeETHToken', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let validatorPubkey = getValidatorPubkey();
        let withdrawalBalance = web3.utils.toBN(web3.utils.toWei('36', 'ether'));
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

            // Set settings
            await setMinipoolSetting('WithdrawalDelay', 0, {from: owner});

            // Create, stake, exit, withdraw & close minipool
            let minipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            await stakeMinipool(minipool, validatorPubkey, {from: node});
            await exitMinipool(minipool.address, {from: trustedNode});
            await withdrawMinipool(minipool.address, withdrawalBalance, {from: trustedNode});
            await closeMinipool(minipool, {from: node});

            // Check node nETH balance
            let nethBalance = await getNethBalance(node);
            assert(nethBalance.eq(withdrawalBalance), 'Incorrect node nETH balance');

        });


        it(printTitle('nETH holder', 'can burn nETH for ETH'), async () => {

            // Withdraw minipool validator balance to nETH contract
            await withdrawValidator(validatorPubkey, {from: trustedNode, value: withdrawalBalance});

            // Burn nETH
            await burnNeth(withdrawalBalance, {
                from: node,
            });

        });


    });
}
