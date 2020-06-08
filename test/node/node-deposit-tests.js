import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { getMinipoolSetting, setNodeSetting } from '../_helpers/settings';
import { deposit } from './scenarios-deposit';

export default function() {
    contract('RocketNodeDeposit', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Get minipool settings
        let activePoolNodeDepositAmount;
        let idlePoolNodeDepositAmount;
        let emptyPoolNodeDepositAmount;
        before(async () => {
            activePoolNodeDepositAmount = await getMinipoolSetting('ActivePoolNodeDeposit');
            idlePoolNodeDepositAmount = await getMinipoolSetting('IdlePoolNodeDeposit');
            emptyPoolNodeDepositAmount = await getMinipoolSetting('EmptyPoolNodeDeposit');
        });


        it(printTitle('node operator', 'can make a deposit to create an active or idle minipool'), async () => {

            // Register node
            await registerNode({from: node});

            // Deposit
            await deposit({
                from: node,
                value: activePoolNodeDepositAmount,
            });
            await deposit({
                from: node,
                value: idlePoolNodeDepositAmount,
            });

        });


        it(printTitle('node operator', 'cannot make a deposit while deposits are disabled'), async () => {

            // Register node
            await registerNode({from: node});

            // Disable deposits
            await setNodeSetting('DepositEnabled', false, {from: owner});

            // Attempt deposit
            await shouldRevert(deposit({
                from: node,
                value: activePoolNodeDepositAmount,
            }), 'Made a deposit while deposits were disabled');
            await shouldRevert(deposit({
                from: node,
                value: idlePoolNodeDepositAmount,
            }), 'Made a deposit while deposits were disabled');

        });


        it(printTitle('node operator', 'cannot make a deposit with an invalid amount'), async () => {

            // Register node
            await registerNode({from: node});

            // Get deposit amount
            let depositAmount = web3.utils.toBN(web3.utils.toWei('10', 'ether'));
            assert(!depositAmount.eq(activePoolNodeDepositAmount), 'Deposit amount is not invalid');
            assert(!depositAmount.eq(idlePoolNodeDepositAmount), 'Deposit amount is not invalid');
            assert(!depositAmount.eq(emptyPoolNodeDepositAmount), 'Deposit amount is not invalid');

            // Attempt deposit
            await shouldRevert(deposit({
                from: node,
                value: depositAmount,
            }), 'Made a deposit with an invalid deposit amount');

        });


        it(printTitle('trusted node operator', 'can make a deposit to create an empty minipool'), async () => {

            // Register trustes node
            await registerNode({from: node});
            await setNodeTrusted(node, {from: owner});

            // Deposit
            await deposit({
                from: node,
                value: emptyPoolNodeDepositAmount,
            });

        });


        it(printTitle('regular node operator', 'cannot make a deposit to create an empty minipool'), async () => {

            // Register node
            await registerNode({from: node});

            // Deposit
            await shouldRevert(deposit({
                from: node,
                value: emptyPoolNodeDepositAmount,
            }), 'Regular node created an empty minipool');

        });


        it(printTitle('random address', 'cannot make a deposit'), async () => {

            // Deposit
            await shouldRevert(deposit({
                from: random,
                value: activePoolNodeDepositAmount,
            }), 'Random address made a deposit');
            await shouldRevert(deposit({
                from: random,
                value: idlePoolNodeDepositAmount,
            }), 'Random address made a deposit');

        });


    });
}
