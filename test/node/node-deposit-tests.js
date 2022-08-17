import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { RocketDAOProtocolSettingsNode } from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { getNodeFee } from '../_helpers/network';
import { registerNode, setNodeTrusted, nodeStakeRPL } from '../_helpers/node';
import { getMinipoolSetting } from '../_helpers/settings';
import { mintRPL } from '../_helpers/tokens';
import { deposit } from './scenario-deposit';
import { userDeposit } from '../_helpers/deposit'

export default function() {
    contract('RocketNodeDeposit', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
            random,
        ] = accounts;


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
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Get settings
            fullDepositNodeAmount = await getMinipoolSetting('FullDepositNodeAmount');
            halfDepositNodeAmount = await getMinipoolSetting('HalfDepositNodeAmount');
            emptyDepositNodeAmount = await getMinipoolSetting('EmptyDepositNodeAmount');

        });


        it(printTitle('node operator', 'can make a deposit to create a minipool'), async () => {

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(web3.utils.toBN(2));
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

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

            // Stake RPL to cover minipool
            let rplStake = await getMinipoolMinimumRPLStake();
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Disable deposits
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.deposit.enabled', false, {from: owner});

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

            // Stake RPL to cover minipool
            let rplStake = await getMinipoolMinimumRPLStake();
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Settings
            let nodeFee = await getNodeFee();
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

            // Stake RPL to cover minipool
            let rplStake = await getMinipoolMinimumRPLStake();
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

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


        it(printTitle('node operator', 'cannot make a deposit with insufficient RPL staked'), async () => {

            // Attempt deposit with no RPL staked
            await shouldRevert(deposit(noMinimumNodeFee, {
                from: node,
                value: fullDepositNodeAmount,
            }), 'Made a deposit with insufficient RPL staked');

            // Stake insufficient RPL amount
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.div(web3.utils.toBN(2));
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Attempt deposit with insufficient RPL staked
            await shouldRevert(deposit(noMinimumNodeFee, {
                from: node,
                value: fullDepositNodeAmount,
            }), 'Made a deposit with insufficient RPL staked');

        });


        // Unbonded minipools temporarily disabled

        // it(printTitle('trusted node operator', 'can make a deposit to create an empty minipool'), async () => {
        //     // Deposit enough unassigned ETH to increase the fee above 80% of max
        //     await userDeposit({from: random, value: web3.utils.toWei('900', 'ether')});
        //
        //     // Stake RPL to cover minipool
        //     let rplStake = await getMinipoolMinimumRPLStake();
        //     await mintRPL(owner, trustedNode, rplStake);
        //     await nodeStakeRPL(rplStake, {from: trustedNode});
        //
        //     // Deposit
        //     await deposit(noMinimumNodeFee, {
        //         from: trustedNode,
        //         value: emptyDepositNodeAmount,
        //     });
        //
        // });


        it(printTitle('regular node operator', 'cannot make a deposit to create an empty minipool'), async () => {

            // Stake RPL to cover minipool
            let rplStake = await getMinipoolMinimumRPLStake();
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

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
