import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { mintRPLBond, bootstrapMember, memberJoin } from '../_helpers/dao';
import { userDeposit } from '../_helpers/deposit';
import { getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { submitBalances } from '../_helpers/network';
import { registerNode, setNodeTrusted, nodeDeposit, nodeStakeRPL } from '../_helpers/node';
import { getRethExchangeRate, getRethTotalSupply, mintRPL } from '../_helpers/tokens';
import { getDepositSetting, setDepositSetting } from '../_helpers/settings';
import { assignDeposits } from './scenario-assign-deposits';
import { deposit } from './scenario-deposit';

export default function() {
    contract('RocketDepositPool', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
            staker,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);
 
            // Add trusted node to DAO
            await mintRPLBond(owner, trustedNode);
            await bootstrapMember(trustedNode, 'rpl', 'node@rocketpool.net', {from: owner});
            await memberJoin({from: trustedNode});

        });


        //
        // Deposit
        //


        it(printTitle('staker', 'can make a deposit'), async () => {

            // Deposit
            await deposit({
                from: staker,
                value: web3.utils.toWei('10', 'ether'),
            });

            // Get current rETH exchange rate
            let exchangeRate1 = await getRethExchangeRate();

            // Update network ETH total to 130% to alter rETH exchange rate
            let totalBalance = web3.utils.toWei('13', 'ether');
            let rethSupply = await getRethTotalSupply();
            await submitBalances(1, totalBalance, 0, rethSupply, {from: trustedNode});

            // Get & check updated rETH exchange rate
            let exchangeRate2 = await getRethExchangeRate();
            assert(!exchangeRate1.eq(exchangeRate2), 'rETH exchange rate has not changed');

            // Deposit again with updated rETH exchange rate
            await deposit({
                from: staker,
                value: web3.utils.toWei('10', 'ether'),
            });

        });


        it(printTitle('staker', 'cannot make a deposit while deposits are disabled'), async () => {

            // Disable deposits
            await setDepositSetting('DepositEnabled', false, {from: owner});

            // Attempt deposit
            await shouldRevert(deposit({
                from: staker,
                value: web3.utils.toWei('10', 'ether'),
            }), 'Made a deposit while deposits are disabled');

        });


        it(printTitle('staker', 'cannot make a deposit below the minimum deposit amount'), async () => {

            // Get & check deposit amount
            let minimumDeposit = await getDepositSetting('MinimumDeposit');
            let depositAmount = minimumDeposit.div(web3.utils.toBN(2));
            assert(depositAmount.lt(minimumDeposit), 'Deposit amount is not less than the minimum deposit');

            // Attempt deposit
            await shouldRevert(deposit({
                from: staker,
                value: depositAmount,
            }), 'Made a deposit below the minimum deposit amount');

        });


        it(printTitle('staker', 'cannot make a deposit which would exceed the maximum deposit pool size'), async () => {

            // Set max deposit pool size
            await setDepositSetting('MaximumDepositPoolSize', web3.utils.toWei('100', 'ether'), {from: owner});

            // Attempt deposit
            await shouldRevert(deposit({
                from: staker,
                value: web3.utils.toWei('101', 'ether'),
            }), 'Made a deposit which exceeds the maximum deposit pool size');

        });


        //
        // Assign deposits
        //


        it(printTitle('random address', 'can assign deposits'), async () => {

            // Assign deposits with no assignable deposits
            await assignDeposits({
                from: staker,
            });

            // Disable deposit assignment
            await setDepositSetting('AssignDepositsEnabled', false, {from: owner});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(web3.utils.toBN(3));
            await mintRPL(owner, trustedNode, rplStake);
            await nodeStakeRPL(rplStake, {from: trustedNode});

            // Make user & node deposits
            await userDeposit({from: staker, value: web3.utils.toWei('100', 'ether')});
            await nodeDeposit({from: trustedNode, value: web3.utils.toWei('16', 'ether')});
            await nodeDeposit({from: trustedNode, value: web3.utils.toWei('32', 'ether')});
            await nodeDeposit({from: trustedNode, value: web3.utils.toWei('0', 'ether')});

            // Re-enable deposit assignment & set limit
            await setDepositSetting('AssignDepositsEnabled', true, {from: owner});
            await setDepositSetting('MaximumDepositAssignments', 3, {from: owner});

            // Assign deposits with assignable deposits
            await assignDeposits({
                from: staker,
            });

        });


        it(printTitle('random address', 'cannot assign deposits while deposit assignment is disabled'), async () => {

            // Disable deposit assignment
            await setDepositSetting('AssignDepositsEnabled', false, {from: owner});

            // Attempt to assign deposits
            await shouldRevert(assignDeposits({
                from: staker,
            }), 'Assigned deposits while deposit assignment is disabled');

        });


    });
}
