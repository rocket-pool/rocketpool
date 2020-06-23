import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getCurrentNodeFee } from '../_helpers/network';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { getMinipoolSetting, setNodeSetting } from '../_helpers/settings';
import { deposit } from './scenarios-deposit';

export default function() {
    contract('RocketNodeDeposit', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let noMinimumNodeFee = web3.utils.toWei('0', 'ether');
        let fullDepositNodeAmount;
        let halfDepositNodeAmount;
        let emptyDepositNodeAmount;
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

            // Get settings
            fullDepositNodeAmount = await getMinipoolSetting('FullDepositNodeAmount');
            halfDepositNodeAmount = await getMinipoolSetting('HalfDepositNodeAmount');
            emptyDepositNodeAmount = await getMinipoolSetting('EmptyDepositNodeAmount');

        });


        it(printTitle('node operator', 'can make a deposit to create a minipool'), async () => {

            // Deposit
            await deposit(noMinimumNodeFee, {
                from: node,
                value: fullDepositNodeAmount,
            });

            // Deposit
            await deposit(noMinimumNodeFee, {
                from: node,
                value: halfDepositNodeAmount,
            });

        });


        it(printTitle('node operator', 'cannot make a deposit while deposits are disabled'), async () => {

            // Disable deposits
            await setNodeSetting('DepositEnabled', false, {from: owner});

            // Attempt deposit
            await shouldRevert(deposit(noMinimumNodeFee, {
                from: node,
                value: fullDepositNodeAmount,
            }), 'Made a deposit while deposits were disabled');

            // Attempt deposit
            await shouldRevert(deposit(noMinimumNodeFee, {
                from: node,
                value: halfDepositNodeAmount,
            }), 'Made a deposit while deposits were disabled');

        });


        it(printTitle('node operator', 'cannot make a deposit with a minimum node fee exceeding the current network node fee'), async () => {

            // Settings
            let nodeFee = await getCurrentNodeFee();
            let minimumNodeFee = nodeFee.add(web3.utils.toBN(web3.utils.toWei('0.01', 'ether')));

            // Attempt deposit
            await shouldRevert(deposit(minimumNodeFee, {
                from: node,
                value: fullDepositNodeAmount,
            }), 'Made a deposit with a minimum node fee exceeding the current network node fee');

            // Attempt deposit
            await shouldRevert(deposit(minimumNodeFee, {
                from: node,
                value: halfDepositNodeAmount,
            }), 'Made a deposit with a minimum node fee exceeding the current network node fee');

        });


        it(printTitle('node operator', 'cannot make a deposit with an invalid amount'), async () => {

            // Get deposit amount
            let depositAmount = web3.utils.toBN(web3.utils.toWei('10', 'ether'));
            assert(!depositAmount.eq(fullDepositNodeAmount), 'Deposit amount is not invalid');
            assert(!depositAmount.eq(halfDepositNodeAmount), 'Deposit amount is not invalid');
            assert(!depositAmount.eq(emptyDepositNodeAmount), 'Deposit amount is not invalid');

            // Attempt deposit
            await shouldRevert(deposit(noMinimumNodeFee, {
                from: node,
                value: depositAmount,
            }), 'Made a deposit with an invalid deposit amount');

        });


        it(printTitle('trusted node operator', 'can make a deposit to create an empty minipool'), async () => {

            // Deposit
            await deposit(noMinimumNodeFee, {
                from: trustedNode,
                value: emptyDepositNodeAmount,
            });

        });


        it(printTitle('regular node operator', 'cannot make a deposit to create an empty minipool'), async () => {

            // Attempt deposit
            await shouldRevert(deposit(noMinimumNodeFee, {
                from: node,
                value: emptyDepositNodeAmount,
            }), 'Regular node created an empty minipool');

        });


        it(printTitle('random address', 'cannot make a deposit'), async () => {

            // Attempt deposit
            await shouldRevert(deposit(noMinimumNodeFee, {
                from: random,
                value: fullDepositNodeAmount,
            }), 'Random address made a deposit');

            // Attempt deposit
            await shouldRevert(deposit(noMinimumNodeFee, {
                from: random,
                value: halfDepositNodeAmount,
            }), 'Random address made a deposit');

        });


    });
}
