import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { createMinipool, stakeMinipool, setMinipoolExited, setMinipoolWithdrawable } from '../_helpers/minipool';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { withdraw } from './scenarios-withdraw';

export default function() {
    contract('RocketNetworkWithdrawal', async (accounts) => {


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
        let withdrawalBalance = web3.utils.toWei('36', 'ether');
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

            // Create withdrawable minipool
            let minipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            await stakeMinipool(minipool, validatorPubkey, {from: node});
            await setMinipoolExited(minipool.address, {from: trustedNode});
            await setMinipoolWithdrawable(minipool.address, withdrawalBalance, {from: trustedNode});

        });


        it(printTitle('trusted node', 'can process a validator withdrawal'), async () => {

            // Process withdrawal
            await withdraw(validatorPubkey, {
                from: trustedNode,
                value: withdrawalBalance,
            });

        });


        it(printTitle('trusted node', 'cannot process a withdrawal for an invalid validator'), async () => {

            // Attempt to process withdrawal
            await shouldRevert(withdraw(getValidatorPubkey(), {
                from: trustedNode,
                value: withdrawalBalance,
            }), 'Processed a withdrawal for an invalid validator');

        });


        it(printTitle('trusted node', 'cannot process a validator withdrawal with an incorrect withdrawal balance'), async () => {

            // Attempt to process withdrawal
            await shouldRevert(withdraw(validatorPubkey, {
                from: trustedNode,
                value: web3.utils.toWei('10', 'ether'),
            }), 'Processed a validator withdrawal with an incorrect withdrawal balance');

        });


        it(printTitle('regular node', 'cannot process a validator withdrawal'), async () => {

            // Attempt to process withdrawal
            await shouldRevert(withdraw(validatorPubkey, {
                from: node,
                value: withdrawalBalance,
            }), 'Regular node processed a validator withdrawal');

        });


    });
}
