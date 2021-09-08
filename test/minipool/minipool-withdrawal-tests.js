import {
    RocketDAONodeTrustedUpgrade,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketMinipoolPenalty,
    RocketMinipoolStatus,
    RocketStorage,
    PenaltyTest,
    RocketNodeStaking,
} from '../_utils/artifacts';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { userDeposit } from '../_helpers/deposit';
import { getMinipoolMinimumRPLStake, createMinipool, stakeMinipool, submitMinipoolWithdrawable, dissolveMinipool } from '../_helpers/minipool';
import { registerNode, setNodeTrusted, setNodeWithdrawalAddress, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { withdrawValidatorBalance } from './scenario-withdraw-validator-balance';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { increaseTime, mineBlocks } from '../_utils/evm'
import { setDaoNodeTrustedBootstrapUpgrade } from '../dao/scenario-dao-node-trusted-bootstrap'
import { submitPrices } from '../_helpers/network';

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
        let minipool, unbondedMinipool, fullDepositMinipool;
        let maxPenaltyRate = web3.utils.toWei('0.5', 'ether');
        let penaltyTestContract;

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

            // Set rETH collateralisation target to a value high enough it won't cause excess ETH to be funneled back into deposit pool and mess with our calcs
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.reth.collateral.target', web3.utils.toWei('50', 'ether'), {from: owner});

            // Set RPL price
            let block = await web3.eth.getBlockNumber();
            await submitPrices(block, web3.utils.toWei('1', 'ether'), '0', {from: trustedNode});

            // Add penalty helper contract
            const rocketStorage = await RocketStorage.deployed();
            penaltyTestContract = await PenaltyTest.new(rocketStorage.address, {from: owner});
            await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketPenaltyTest', penaltyTestContract.abi, penaltyTestContract.address, {
                from: owner,
            });

            // Enable penalties
            const rocketMinipoolPenalty = await RocketMinipoolPenalty.deployed();
            await rocketMinipoolPenalty.setMaxPenaltyRate(maxPenaltyRate, {from: owner})

            // Hard code fee to 50%
            const fee = web3.utils.toWei('0.5', 'ether');
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', fee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', fee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', fee, {from: owner});

            // Deposit some user funds to assign to pools
            let userDepositAmount = web3.utils.toWei('48', 'ether');
            await userDeposit({from: random, value: userDepositAmount});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(web3.utils.toBN(3));
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});
            await mintRPL(owner, trustedNode, rplStake);
            await nodeStakeRPL(rplStake, {from: trustedNode});

            // Create minipools
            minipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            await stakeMinipool(minipool, null, {from: node});
            unbondedMinipool = await createMinipool({from: trustedNode});
            await stakeMinipool(unbondedMinipool, null, {from: trustedNode});
            fullDepositMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            await stakeMinipool(fullDepositMinipool, null, {from: node});
        });


        async function withdrawAndCheck(minipool, withdrawalBalance, from, finalise, expectedUser, expectedNode) {
            const withdrawalBalanceBN = web3.utils.toBN(web3.utils.toWei(withdrawalBalance, 'ether'));
            const expectedUserBN = web3.utils.toBN(web3.utils.toWei(expectedUser, 'ether'));
            const expectedNodeBN = web3.utils.toBN(web3.utils.toWei(expectedNode, 'ether'));

            // Process withdrawal
            const {
                nodeBalanceChange,
                rethBalanceChange
            }
              = await withdrawValidatorBalance(minipool, withdrawalBalanceBN, from, finalise);

            // Check results
            assert(expectedUserBN.eq(rethBalanceChange), "User balance was incorrect");
            assert(expectedNodeBN.eq(nodeBalanceChange), "Node balance was incorrect");
        }


        async function slashAndCheck(from, expectedSlash) {
            // Get contracts
            const rocketNodeStaking = await RocketNodeStaking.deployed()
            const rplStake1 = await rocketNodeStaking.getNodeRPLStake(node)
            await minipool.slash({from: from})
            const rplStake2 = await rocketNodeStaking.getNodeRPLStake(node)
            const slashedAmount = rplStake1.sub(rplStake2)
            assert(expectedSlash.eq(slashedAmount), 'Slashed amount was incorrect')
        }


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck(minipool, '36', nodeWithdrawalAddress, true, '17', '19');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Wait 14 days
            await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
            // Process withdraw
            await withdrawAndCheck(minipool, '36', random, false, '17', '19');
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '36', nodeWithdrawalAddress, false, '17', '19');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '36', random, false, '17', '19');
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 16 ETH, less than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck(minipool, '28', nodeWithdrawalAddress, true, '16', '12');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 16 ETH, less than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Wait 14 days
            await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
            // Process withdraw
            await withdrawAndCheck(minipool, '28', random, false, '16', '12');
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 16 ETH, less than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '28', nodeWithdrawalAddress, false, '16', '12');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 16 ETH, less than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '28', random, false, '16', '12');
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is less than 16 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck(minipool, '15', nodeWithdrawalAddress, true, '15', '0');
        });


        it(printTitle('random address', 'can process withdrawal when balance is less than 16 ETH and marked as withdrawable after 14 days'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Wait 14 days
            await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
            // Process withdraw and check slash
            await withdrawAndCheck('15', random, false, '15', '0');
            await slashAndCheck(random, web3.utils.toBN(web3.utils.toWei('1')))
        });


        it(printTitle('random address', 'cannot slash a node operator by sending 4 ETH and distribute after 14 days'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck('28', trustedNode, true, '16', '12');
            // Wait 14 days and mine enough blocks to pass cooldown
            await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
            await mineBlocks(web3, 101)
            // Process withdraw and attempt to slash
            await withdrawAndCheck('4', random, false, '4', '0');
            await shouldRevert(minipool.slash(), 'Was able to slash minipool', 'No balance to slash')
        });


        it(printTitle('random address', 'cannot process withdrawal when balance is less than 16 ETH and marked as withdrawable before 14 days'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            const withdrawalBalance = web3.utils.toWei('15', 'ether');
            await shouldRevert(withdrawValidatorBalance(minipool, withdrawalBalance, random, false), 'Processed withdrawal before 14 days have passed', 'Non-owner must wait 14 days after withdrawal to distribute balance');
        });


        it(printTitle('node operator withdrawal address', 'cannot process withdrawal and finalise minipool while not marked as withdrawable'), async () => {
            // Process withdraw
            const withdrawalBalance = web3.utils.toWei('32', 'ether');
            await shouldRevert(withdrawValidatorBalance(minipool, withdrawalBalance, nodeWithdrawalAddress, true), 'Processed withdrawal and finalise pool while status was not withdrawable', 'Minipool must be withdrawable');
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is less than 16 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '15', nodeWithdrawalAddress, false, '15', '0');
        });


        it(printTitle('node operator withdrawal address', 'cannot process withdrawal and finalise pool when balance is less than 16 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            const withdrawalBalance = web3.utils.toWei('15', 'ether');
            await shouldRevert(withdrawValidatorBalance(minipool, withdrawalBalance, nodeWithdrawalAddress, true), 'Processed withdrawal and finalise pool while status was not withdrawable', 'Minipool must be withdrawable');
        });


        // Unbonded pools


        it(printTitle('trusted node', 'can process withdrawal on unbonded minipool when balance is greater than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(unbondedMinipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck(unbondedMinipool, '36', trustedNode, true, '35', '1');
        });


        it(printTitle('trusted node', 'can process withdrawal on unbonded minipool when balance is less than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(unbondedMinipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck(unbondedMinipool, '30', trustedNode, true, '30', '0');
        });


        // Full deposit minipools


        it.only(printTitle('trusted node', 'can process withdrawal on full deposit minipool when balance is greater than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(fullDepositMinipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck(fullDepositMinipool, '36', node, true, '1', '35');
        });


        it.only(printTitle('trusted node', 'can process withdrawal on full deposit minipool when balance is less than 32 ETH and marked as withdrawable'), async () => {
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(fullDepositMinipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck(fullDepositMinipool, '30', node, true, '0', '30');
        });


        // ETH penalty events


        it(printTitle('node operator withdrawal address', 'can process withdrawal and finalise pool when penalised by DAO'), async () => {
            // Penalise the minipool 50% of it's ETH
            await penaltyTestContract.setPenaltyRate(minipool.address, maxPenaltyRate);
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw - 36 ETH would normally give node operator 19 and user 17 but with a 50% penalty, and extra 9.5 goes to the user
            await withdrawAndCheck(minipool, '36', nodeWithdrawalAddress, true, '26.5', '9.5');
        });


        it(printTitle('node operator withdrawal address', 'cannot be penalised greater than the max penalty rate set by DAO'), async () => {
            // Try to penalise the minipool 75% of it's ETH (max is 50%)
            await penaltyTestContract.setPenaltyRate(minipool.address, web3.utils.toWei('0.75'));
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw - 36 ETH would normally give node operator 19 and user 17 but with a 50% penalty, and extra 9.5 goes to the user
            await withdrawAndCheck(minipool, '36', nodeWithdrawalAddress, true, '26.5', '9.5');
        });


        it(printTitle('guardian', 'can disable penalising all together'), async () => {
            // Disable penalising by setting rate to 0
            const rocketMinipoolPenalty = await RocketMinipoolPenalty.deployed();
            await rocketMinipoolPenalty.setMaxPenaltyRate('0', {from: owner})
            // Try to penalise the minipool 50%
            await penaltyTestContract.setPenaltyRate(minipool.address, web3.utils.toWei('0.5'));
            // Mark minipool withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: trustedNode});
            // Process withdraw
            await withdrawAndCheck(minipool, '36', nodeWithdrawalAddress, true, '17', '19');
        });
    })
}
