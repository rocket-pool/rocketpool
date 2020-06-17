import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { createMinipool, stakeMinipool, setMinipoolExited, setMinipoolWithdrawable } from '../_helpers/minipool';
import { acceptValidatorWithdrawal } from '../_helpers/network';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { processWithdrawal } from './scenarios-withdrawal';

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

            // Accept withdrawal
            await acceptValidatorWithdrawal({from: owner, value: withdrawalBalance});

            // Process withdrawal
            await processWithdrawal(validatorPubkey, {
                from: trustedNode,
            });

        });


        it(printTitle('trusted node', 'cannot process a withdrawal for an invalid validator'), async () => {

            // Accept withdrawal
            await acceptValidatorWithdrawal({from: owner, value: withdrawalBalance});

            // Attempt to process withdrawal
            await shouldRevert(processWithdrawal(getValidatorPubkey(), {
                from: trustedNode,
            }), 'Processed a withdrawal for an invalid validator');

        });


        it(printTitle('trusted node', 'cannot process a validator withdrawal for a minipool which is not withdrawable'));


        it(printTitle('trusted node', 'cannot process a validator withdrawal which has already been processed'), async () => {

            // Accept withdrawals
            await acceptValidatorWithdrawal({from: owner, value: withdrawalBalance});
            await acceptValidatorWithdrawal({from: owner, value: withdrawalBalance});

            // Process withdrawal
            await processWithdrawal(validatorPubkey, {from: trustedNode});

            // Attempt to process withdrawal again
            await shouldRevert(processWithdrawal(validatorPubkey, {
                from: trustedNode,
            }), 'Processed a validator withdrawal which had already been processed');

        });


        it(printTitle('trusted node', 'cannot process a validator withdrawal with an insufficient withdrawal pool balance'), async () => {

            // Attempt to process withdrawal
            await shouldRevert(processWithdrawal(validatorPubkey, {
                from: trustedNode,
            }), 'Processed a validator withdrawal with an insufficient withdrawal pool balance');

        });


        it(printTitle('regular node', 'cannot process a validator withdrawal'), async () => {

            // Accept withdrawal
            await acceptValidatorWithdrawal({from: owner, value: withdrawalBalance});

            // Attempt to process withdrawal
            await shouldRevert(processWithdrawal(validatorPubkey, {
                from: node,
            }), 'Regular node processed a validator withdrawal');

        });


    });
}
