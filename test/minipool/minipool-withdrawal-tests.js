import {
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketMinipoolPenalty,
    RocketStorage,
    PenaltyTest,
    RocketNodeStaking, RocketDAONodeTrustedSettingsMinipool,
} from '../_utils/artifacts';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { userDeposit } from '../_helpers/deposit';
import { getMinipoolMinimumRPLStake, createMinipool, stakeMinipool } from '../_helpers/minipool';
import { registerNode, setNodeTrusted, setNodeWithdrawalAddress, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { beginUserDistribute, withdrawValidatorBalance } from './scenario-withdraw-validator-balance';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { increaseTime, mineBlocks } from '../_utils/evm'
import {
    setDAONodeTrustedBootstrapSetting,
    setDaoNodeTrustedBootstrapUpgrade
} from '../dao/scenario-dao-node-trusted-bootstrap';
import { submitPrices } from '../_helpers/network';
import { assertBN } from '../_helpers/bn';

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
        let launchTimeout =  (60 * 60 * 72); // 72 hours
        let withdrawalDelay = 20;
        let scrubPeriod = (60 * 60 * 24); // 24 hours
        let minipool;
        let maxPenaltyRate = '0.5'.ether;
        let penaltyTestContract;
        let userDistributeStartTime = (60 * 60 * 72);
        let userDistributeLength = (60 * 60);

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
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.user.distribute.window.start', userDistributeStartTime, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.user.distribute.window.length', userDistributeLength, {from: owner});
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});

            // Set rETH collateralisation target to a value high enough it won't cause excess ETH to be funneled back into deposit pool and mess with our calcs
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.reth.collateral.target', '50'.ether, {from: owner});

            // Set RPL price
            let block = await web3.eth.getBlockNumber();
            let slotTimestamp = '1600000000';
            await submitPrices(block, slotTimestamp, '1'.ether, {from: trustedNode});

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
            const fee = '0.5'.ether;
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', fee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', fee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', fee, {from: owner});

            // Deposit some user funds to assign to pools
            let userDepositAmount = '16'.ether;
            await userDeposit({from: random, value: userDepositAmount});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul('3'.BN);
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});
            await mintRPL(owner, trustedNode, rplStake);
            await nodeStakeRPL(rplStake, {from: trustedNode});

            // Create minipools
            minipool = await createMinipool({from: node, value: '16'.ether});

            // Wait required scrub period
            await increaseTime(web3, scrubPeriod + 1);

            // Stake minipools
            await stakeMinipool(minipool, {from: node});
        });


        async function withdrawAndCheck(minipool, withdrawalBalance, from, finalise, expectedUser, expectedNode, userDistribute = false) {
            const withdrawalBalanceBN = withdrawalBalance.ether;
            const expectedUserBN = expectedUser.ether;
            const expectedNodeBN = expectedNode.ether;

            let result

            if (userDistribute) {
                // Send ETH to minipool
                await web3.eth.sendTransaction({
                    from: from,
                    to: minipool.address,
                    value: withdrawalBalanceBN
                });
                // Begin user distribution process
                await beginUserDistribute(minipool, {from});
                // Wait 14 days
                await increaseTime(web3, userDistributeStartTime + 1)
                // Process withdrawal
                result = await withdrawValidatorBalance(minipool, '0'.ether, from, finalise);
            } else {
                // Process withdrawal
                result = await withdrawValidatorBalance(minipool, withdrawalBalanceBN, from, finalise);
            }

            // Check results
            assertBN.equal(expectedUserBN, result.rethBalanceChange, "User balance was incorrect");
            assertBN.equal(expectedNodeBN, result.nodeBalanceChange, "Node balance was incorrect");
        }


        async function slashAndCheck(from, expectedSlash) {
            // Get contracts
            const rocketNodeStaking = await RocketNodeStaking.deployed()
            const rplStake1 = await rocketNodeStaking.getNodeRPLStake(node)
            await minipool.slash({from: from})
            const rplStake2 = await rocketNodeStaking.getNodeRPLStake(node)
            const slashedAmount = rplStake1.sub(rplStake2)
            assertBN.equal(expectedSlash, slashedAmount, 'Slashed amount was incorrect')
        }


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '36', nodeWithdrawalAddress, false, '17', '19');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '36', random, false, '17', '19', true);
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 16 ETH and less than 32 ETH'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '28', nodeWithdrawalAddress, true, '16', '12');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 16 ETH and less than 32 ETH'), async () => {
            // Wait 14 days
            await increaseTime(web3, userDistributeStartTime + 1)
            // Process withdraw
            await withdrawAndCheck(minipool, '28', random, false, '16', '12', true);
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is greater than 16 ETH, less than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '28', nodeWithdrawalAddress, false, '16', '12');
        });


        it(printTitle('random user', 'can process withdrawal when balance is greater than 16 ETH, less than 32 ETH and not marked as withdrawable'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '28', random, false, '16', '12', true);
        });


        it(printTitle('random user', 'can not begin user distribution without waiting for window to pass'), async () => {
            // Send ETH to minipool
            await web3.eth.sendTransaction({
                from: random,
                to: minipool.address,
                value: '32'.ether
            });
            await beginUserDistribute(minipool, {from: random});
            await shouldRevert(beginUserDistribute(minipool, {from: random}), 'Was able to begin user distribution again', 'User distribution already pending');
        });


        it(printTitle('random user', 'can begin user distribution after window has passed'), async () => {
            // Send ETH to minipool
            await web3.eth.sendTransaction({
                from: random,
                to: minipool.address,
                value: '32'.ether
            });
            await beginUserDistribute(minipool, {from: random});
            await increaseTime(web3, userDistributeLength + userDistributeStartTime + 1)
            await beginUserDistribute(minipool, {from: random});
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is less than 16 ETH'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '15', nodeWithdrawalAddress, true, '15', '0');
        });


        it(printTitle('random address', 'cannot slash a node operator by sending 4 ETH and distribute after 14 days'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '28', nodeWithdrawalAddress, true, '16', '12');
            // Wait 14 days and mine enough blocks to pass cooldown
            await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
            await mineBlocks(web3, 101)
            // Process withdraw and attempt to slash
            await withdrawAndCheck(minipool, '8', random, false, '8', '0', true);
            await shouldRevert(minipool.slash(), 'Was able to slash minipool', 'No balance to slash')
        });


        it(printTitle('node operator withdrawal address', 'can process withdrawal when balance is less than 16 ETH'), async () => {
            // Process withdraw
            await withdrawAndCheck(minipool, '15', nodeWithdrawalAddress, false, '15', '0');
        });


        it(printTitle('node operator withdrawal address', 'should fail when trying to distribute rewards with greater than 8 ETH balance'), async () => {
            // Process withdraw
            await web3.eth.sendTransaction({
                from: random,
                to: minipool.address,
                gas: 12450000,
                value: '8.001'.ether
            });

            await shouldRevert(minipool.distributeBalance(true, {
                from: nodeWithdrawalAddress
            }), 'Distribute succeeded', 'Balance exceeds 8 ether');
        });

        // ETH penalty events


        it(printTitle('node operator withdrawal address', 'can process withdrawal and finalise pool when penalised by DAO'), async () => {
            // Penalise the minipool 50% of it's ETH
            await penaltyTestContract.setPenaltyRate(minipool.address, maxPenaltyRate);
            // Process withdraw - 36 ETH would normally give node operator 19 and user 17 but with a 50% penalty, and extra 9.5 goes to the user
            await withdrawAndCheck(minipool, '36', nodeWithdrawalAddress, true, '26.5', '9.5');
        });


        it(printTitle('node operator withdrawal address', 'cannot be penalised greater than the max penalty rate set by DAO'), async () => {
            // Try to penalise the minipool 75% of it's ETH (max is 50%)
            await penaltyTestContract.setPenaltyRate(minipool.address, web3.utils.toWei('0.75'));
            // Process withdraw - 36 ETH would normally give node operator 19 and user 17 but with a 50% penalty, and extra 9.5 goes to the user
            await withdrawAndCheck(minipool, '36', nodeWithdrawalAddress, true, '26.5', '9.5');
        });


        it(printTitle('guardian', 'can disable penalising all together'), async () => {
            // Disable penalising by setting rate to 0
            const rocketMinipoolPenalty = await RocketMinipoolPenalty.deployed();
            await rocketMinipoolPenalty.setMaxPenaltyRate('0', {from: owner})
            // Try to penalise the minipool 50%
            await penaltyTestContract.setPenaltyRate(minipool.address, web3.utils.toWei('0.5'));
            // Process withdraw
            await withdrawAndCheck(minipool, '36', nodeWithdrawalAddress, true, '17', '19');
        });
    })
}
