import {
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
} from '../_utils/artifacts'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { userDeposit } from '../_helpers/deposit';
import { getMinipoolMinimumRPLStake, createMinipool, stakeMinipool, submitMinipoolWithdrawable, dissolveMinipool } from '../_helpers/minipool';
import { registerNode, setNodeTrusted, setNodeWithdrawalAddress, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { withdrawValidatorBalance } from './scenario-withdraw-validator-balance';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { increaseTime, mineBlocks } from '../_utils/evm'

export default function() {
    contract('RocketMinipool', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            nodeWithdrawalAddress,
            trustedNode,
            random,
        ] = accounts;


        // Setup
        let launchTimeout = 20;
        let withdrawalDelay = 20;
        let minipool;

        before(async () => {

            // Register node & set withdrawal address
            await registerNode({from: node});
            await setNodeWithdrawalAddress(node, nodeWithdrawalAddress, {from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, {from: owner});

            // Hard code fee to 50%
            const fee = web3.utils.toWei('0.5', 'ether');
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', fee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', fee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', fee, {from: owner});

            // Deposit some user funds to assign to pool
            let userDepositAmount = web3.utils.toWei('16', 'ether');
            await userDeposit({from: random, value: userDepositAmount});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(web3.utils.toBN(8));
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Create minipools
            minipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            await stakeMinipool(minipool, null, {from: node});
        });


        async function withdrawAndCheck(withdrawalBalance, from, destroy, expectedUser, expectedNode) {
            const withdrawalBalanceBN = web3.utils.toBN(web3.utils.toWei(withdrawalBalance, 'ether'));
            const expectedUserBN = web3.utils.toBN(web3.utils.toWei(expectedUser, 'ether'));
            const expectedNodeBN = web3.utils.toBN(web3.utils.toWei(expectedNode, 'ether'));

            // Process withdrawal
            const {
                nodeBalanceChange,
                rethBalanceChange
            }
              = await withdrawValidatorBalance(minipool, withdrawalBalanceBN, nodeWithdrawalAddress, destroy);

            // Check results
            assert(expectedUserBN.eq(rethBalanceChange), "User balance was incorrect");
            assert(expectedNodeBN.eq(nodeBalanceChange), "Node balance was incorrect");
        }


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck('36', nodeWithdrawalAddress, true, '17', '19');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck('36', random, false, '17', '19');
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck('36', nodeWithdrawalAddress, false, '17', '19');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck('36', random, false, '17', '19');
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 16 ETH, less than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck('28', nodeWithdrawalAddress, true, '16', '12');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 16 ETH, less than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck('28', random, false, '16', '12');
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 16 ETH, less than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck('28', nodeWithdrawalAddress, false, '16', '12');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 16 ETH, less than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck('28', random, false, '16', '12');
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is less than 16 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck('15', nodeWithdrawalAddress, true, '15', '0');
        });


        it(printTitle('random address', 'can process withdrawal when balance is less than 16 ETH and marked as withdrawable after 7 days'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Wait 7 days
            await increaseTime(web3, 60 * 60 * 24 * 7 + 1)
            // Process withdraw
            await withdrawAndCheck('15', random, false, '15', '0');
        });


        it(printTitle('random address', 'cannot process withdrawal when balance is less than 16 ETH and marked as withdrawable before 7 days'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            const withdrawalBalance = web3.utils.toWei('15', 'ether');
            await shouldRevert(withdrawValidatorBalance(minipool, withdrawalBalance, nodeWithdrawalAddress, false), 'Processed withdrawal before 50k blocks passed', 'Non-owner must wait longer to process sub 16 ETH withdrawal');
        });


        it(printTitle('node operator withdrawal address', 'cannot process withdrawal and destroy minipool while not marked as withdrawable'), async () => {
            // Process withdraw
            const withdrawalBalance = web3.utils.toWei('32', 'ether');
            await shouldRevert(withdrawValidatorBalance(minipool, withdrawalBalance, nodeWithdrawalAddress, true), 'Processed withdrawal and destroyed pool while status was not withdrawable', 'Minipool must be withdrawable to destroy');
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is less than 16 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck('15', nodeWithdrawalAddress, false, '15', '0');
        });


        it(printTitle('node operator withdrawal address', 'cannot process withdrawal and destroy pool when balance is less than 16 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            const withdrawalBalance = web3.utils.toWei('15', 'ether');
            await shouldRevert(withdrawValidatorBalance(minipool, withdrawalBalance, nodeWithdrawalAddress, true), 'Processed withdrawal and destroyed pool while status was not withdrawable', 'Minipool must be withdrawable to destroy');
        });
    })
}
