import { nodeStakeRPL, registerNode, setNodeTrusted } from '../_helpers/node';
import { upgradeOneDotTwo } from '../_utils/upgrade';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import {
    closeMinipool,
    createMinipool,
    createMinipoolWithBondAmount,
    dissolveMinipool,
    minipoolStates,
    stakeMinipool,
} from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsDeposit,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDepositPool,
    RocketMinipoolBase, RocketMinipoolBondReducer,
    RocketMinipoolQueue,
    RocketMinipoolQueueOld,
    RocketNetworkFees, RocketNodeDeposit, RocketNodeStaking,
    RocketTokenRETH,
} from '../_utils/artifacts';
import { increaseTime } from '../_utils/evm';
import { burnReth } from '../token/scenario-reth-burn';
import { shouldRevert } from '../_utils/testing';
import { assertBN } from '../_helpers/bn';
import { reduceBond } from '../minipool/scenario-reduce-bond';
import { voteScrub } from '../minipool/scenario-scrub';
import { close } from '../minipool/scenario-close';


export default function() {
    contract('RocketUpgradeOneDotTwo', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode1,
            trustedNode2,
            random,
        ] = accounts;

        let stakingMinipool;
        let queuedHalfMinipool1;
        let queuedHalfMinipool2;
        let queuedFullMinipool;

        // Constants
        const launchTimeout =  (60 * 60 * 72); // 72 hours
        const withdrawalDelay = 20;
        const scrubPeriod = (60 * 60 * 24); // 24 hours
        const bondReductionWindowStart = (2 * 24 * 60 * 60);
        const bondReductionWindowLength = (2 * 24 * 60 * 60);

        describe('Upgrade Checklist', async () => {
            // Contracts
            let rocketDepositPool;
            let rocketTokenRETH;
            let rocketMinipoolQueue;
            let rocketNetworkFees;
            let rocketNodeStaking;
            let rocketNodeDeposit;
            let rocketMinipoolBondReducer;

            // Setup
            before(async () => {
                rocketDepositPool = await RocketDepositPool.deployed();
                rocketTokenRETH = await RocketTokenRETH.deployed();
                rocketMinipoolQueue = await RocketMinipoolQueue.deployed();
                rocketNetworkFees = await RocketNetworkFees.deployed();
                rocketNodeStaking = await RocketNodeStaking.deployed();
                rocketNodeDeposit = await RocketNodeDeposit.deployed();
                rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();

                // Register node
                await registerNode({from: node});

                // Register trusted node
                await registerNode({from: trustedNode1});
                await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);
                await registerNode({from: trustedNode2});
                await setNodeTrusted(trustedNode2, 'saas_1', 'node@home.com', owner);

                // Set settings
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, {from: owner});
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, {from: owner});
                await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});
                await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.start', bondReductionWindowStart, {from: owner});
                await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.length', bondReductionWindowLength, {from: owner});

                // Stake RPL to cover minipools
                let rplStake = '2000'.ether;
                await mintRPL(owner, node, rplStake);
                await nodeStakeRPL(rplStake, {from: node});

                // Create minipools
                await userDeposit({ from: random, value: '16'.ether, });
                stakingMinipool = await createMinipool({from: node, value: '16'.ether});
                queuedHalfMinipool1 = await createMinipool({from: node, value: '16'.ether});
                queuedHalfMinipool2 = await createMinipool({from: node, value: '16'.ether});
                queuedFullMinipool = await createMinipool({from: node, value: '32'.ether});

                // Wait required scrub period
                await increaseTime(web3, scrubPeriod + 1);

                // Progress minipools into desired statuses
                await stakeMinipool(stakingMinipool, {from: node});
                await stakeMinipool(queuedFullMinipool, {from: node});

                // Check minipool statuses
                let stakingStatus = await stakingMinipool.getStatus.call();
                assertBN.equal(stakingStatus, minipoolStates.Staking, 'Incorrect staking minipool status');
                stakingStatus = await queuedFullMinipool.getStatus.call();
                assertBN.equal(stakingStatus, minipoolStates.Staking, 'Incorrect staking minipool status');
                let initialisedStatus = await queuedHalfMinipool1.getStatus.call();
                assertBN.equal(initialisedStatus, minipoolStates.Initialised, 'Incorrect staking minipool status');
                initialisedStatus = await queuedHalfMinipool2.getStatus.call();
                assertBN.equal(initialisedStatus, minipoolStates.Initialised, 'Incorrect staking minipool status');

                // Check deposit pool balances
                const depositPoolBalance = await rocketDepositPool.getBalance();
                const depositPoolNodeBalance = await rocketDepositPool.getNodeBalance();
                assertBN.isZero(depositPoolBalance, 'Incorrect deposit pool balance');
                assertBN.isZero(depositPoolNodeBalance, 'Incorrect deposit pool node balance');

                // Perform upgrade
                await upgradeOneDotTwo(owner);
            });


            it('Atlas Testing',
                async () => {

                    let variableMinipool1, variableMinipool2, variableMinipool3, variableMinipool4, variableMinipool5;

                    // New Queue Tests (variable queue & queued ETH)

                    {
                        // Test: Deposit 16 ETH into the deposit pool
                        await userDeposit({ from: random, value: '16'.ether });
                        // Expected: 16 ETH is assigned to a legacy half minipool, which becomes prelaunch
                        let status = await queuedHalfMinipool1.getStatus.call();
                        assertBN.equal(status, minipoolStates.Prelaunch, 'Incorrect minipool status');
                    }

                    {
                        // Test: Deposit 8 ETH minipool (with empty deposit pool)
                        variableMinipool1 = await createMinipool({ from: node, value: '8'.ether });
                        // Expected: 1 ETH is deposited on beacon chain, minipool is in queue (initialised), 7 ETH is added to the deposit pool
                        let status = await variableMinipool1.getStatus.call();
                        assertBN.equal(status, minipoolStates.Initialised, 'Incorrect minipool status');
                        const depositPoolBalance = await rocketDepositPool.getBalance();
                        assertBN.equal(depositPoolBalance, '7'.ether, 'Incorrect deposit pool balance');
                    }

                    {
                        // Test: Deposit 16 ETH minipool
                        const depositPoolBalanceBefore = await rocketDepositPool.getBalance();
                        variableMinipool2 = await createMinipool({ from: node, value: '16'.ether });
                        const depositPoolBalanceAfter = await rocketDepositPool.getBalance();
                        // Expected: 1 ETH is deposited on beacon chain, minipool is in queue (initialised), 15 ETH is added to deposit pool, a half legacy minipool should be assigned 16 ETH and moves to prelaunch
                        let status = await variableMinipool2.getStatus.call();
                        assertBN.equal(status, minipoolStates.Initialised, 'Incorrect minipool status');
                        // 15 ETH added to deposit pool and 16 ETH assigned to legacy half pool is 1 ETH less
                        assertBN.equal(depositPoolBalanceAfter, depositPoolBalanceBefore.sub('1'.ether), 'Incorrect change in deposit pool balance');
                        status = await queuedHalfMinipool2.getStatus.call();
                        assertBN.equal(status, minipoolStates.Prelaunch, 'Incorrect minipool status');
                    }

                    {
                        // Test: Deposit 10 ETH into deposit pool
                        await userDeposit({ from: random, value: '10'.ether });
                        // Expected: Legacy full minipool should have a 16 ETH refund
                        const refund = await queuedFullMinipool.getNodeRefundBalance();
                        assertBN.equal(refund, '16'.ether, 'Invalid refund balance');
                    }

                    {
                        // Test: Deposit 31 ETH into deposit pool
                        await userDeposit({ from: random, value: '31'.ether });
                        // Expected: 8 ETH minipool assigned 31 ETH deposit and moved to prelaunch
                        let status = await variableMinipool1.getStatus.call();
                        assertBN.equal(status, minipoolStates.Prelaunch, 'Incorrect minipool status');
                    }

                    {
                        // Test: Deposit 20 ETH into deposit pool
                        await userDeposit({ from: random, value: '20'.ether });
                        // Expected: 20 ETH in deposit pool, no assignments
                        let status = await variableMinipool2.getStatus.call();
                        assertBN.equal(status, minipoolStates.Initialised, 'Incorrect minipool status');
                        const depositPoolBalance = await rocketDepositPool.getBalance();
                        assertBN.equal(depositPoolBalance, '20'.ether, 'Incorrect deposit pool balance');
                    }

                    {
                        // Test: Deposit 11 ETH into deposit pool
                        await userDeposit({ from: random, value: '11'.ether });
                        // Expected: 16 ETH minipool assigned 31 ETH deposit and moved to prelaunch
                        let status = await variableMinipool2.getStatus.call();
                        assertBN.equal(status, minipoolStates.Prelaunch, 'Incorrect minipool status');
                    }

                    {
                        // Test: Deposit 2 ETH into deposit pool
                        await userDeposit({ from: random, value: '2'.ether });
                        // Expected: 2 ETH is in the deposit pool
                        const depositPoolBalance = await rocketDepositPool.getBalance();
                        assertBN.equal(depositPoolBalance, '2'.ether, 'Incorrect deposit pool balance');
                    }

                    // Staking

                    {
                        // Test: Wait for legacy minipools to stake
                        await increaseTime(web3, scrubPeriod);
                        await stakeMinipool(queuedHalfMinipool1, {from: node});
                        await stakeMinipool(queuedHalfMinipool2, {from: node});
                    }

                    {
                        // Test: Wait for new 8 ETH minipool to stake
                        await stakeMinipool(variableMinipool1, {from: node});
                    }

                    {
                        // Test: Wait for new 16 ETH minipool to stake
                        await stakeMinipool(variableMinipool2, {from: node});
                    }

                    // Dissolves

                    {
                        // Test: Deposit 8 ETH minipool, wait beyond timeout period, node calls close on dissolved pool
                        await userDeposit({ from: random, value: '29'.ether });
                        variableMinipool4 = await createMinipool({ from: node, value: '8'.ether });
                        const rethBalance1 = await rocketDepositPool.getBalance();
                        await voteScrub(variableMinipool4, {from: trustedNode1});
                        await voteScrub(variableMinipool4, {from: trustedNode2});
                        const depositBalance2 = await rocketDepositPool.getBalance();
                        await close(variableMinipool4, {from: node});
                        // Expect: 24 ETH transferred to deposit pool
                        assertBN.equal(depositBalance2.sub(rethBalance1), '24'.ether, 'Invalid deposit balance');
                    }

                    {
                        // Test: Deposit 8 ETH minipool, wait beyond timeout period, node calls close on dissolved pool
                        variableMinipool5 = await createMinipool({ from: node, value: '16'.ether });
                        const rethBalance1 = await rocketDepositPool.getBalance();
                        await voteScrub(variableMinipool5, {from: trustedNode1});
                        await voteScrub(variableMinipool5, {from: trustedNode2});
                        const depositBalance2 = await rocketDepositPool.getBalance();
                        await close(variableMinipool5, {from: node});
                        // Expect: 16 ETH transferred to deposit pool
                        assertBN.equal(depositBalance2.sub(rethBalance1), '16'.ether, 'Invalid deposit balance');
                        // Empty queue
                        await burnReth('31'.ether, {from: random});
                    }

                    // Dynamic Deposit Pool Limit Tests

                    {
                        // Test: Deposit 2x 8 ETH minipools
                        variableMinipool4 = await createMinipool({ from: node, value: '8'.ether });
                        variableMinipool5 = await createMinipool({ from: node, value: '8'.ether });
                        // Expected: 2x 8 ETH minipools are in the queue and unassigned, deposit pool contains 14 ETH from node deposits
                        assertBN.equal(await rocketMinipoolQueue.getTotalLength(), '2', 'Invalid queue length')
                        assertBN.equal(await rocketDepositPool.getBalance(), '14'.ether, 'Invalid deposit balance');
                    }

                    {
                        // Test: Set deposit limit to 1 ETH
                        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.pool.maximum', '1'.ether, {from: owner});
                        // Expected: Deposit limit set to 1 ETH, dynamic limit should be 49 ETH (1+24*2)
                        assertBN.equal(await rocketDepositPool.getMaximumDepositAmount(), '49'.ether, 'Invalid maximum deposit amount')
                    }

                    {
                        // Test: Deposit 50 ETH into deposit pool
                        // Expected: Deposit should fail
                        await shouldRevert(userDeposit({ from: random, value: '50'.ether }), 'Was able to deposit more than maximum', 'The deposit pool size after depositing (and matching with minipools) exceeds the maximum size');
                    }

                    {
                        // Test: Deposit 49 ETH into deposit pool
                        // Expected: Deposit should succeed, 2x 8 ETH minipools should be assigned, deposit pool should have 1 ETH remaining
                        await userDeposit({ from: random, value: '49'.ether });
                        assertBN.equal(await rocketMinipoolQueue.getTotalLength(), '0', 'Invalid queue length')
                        assertBN.equal(await rocketDepositPool.getBalance(), '1'.ether, 'Invalid deposit balance');
                        // Reset deposit limit
                        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.pool.maximum', '360'.ether, {from: owner});
                    }

                    // rETH Burn
                    await userDeposit({ from: random, value: '1'.ether });
                    // Note: 1 ETH still remains in the deposit pool from above tests and we just added 1 more so we're at 2 ETH

                    {
                        // Test: Burn 1 rETH with no minipools in queue
                        // Expected: rETH burn should succeed
                        await burnReth('1'.ether, {from: random});
                    }

                    {
                        // Test: Deposit 8 ETH minipool
                        variableMinipool3 = await createMinipool({ from: node, value: '8'.ether });
                        // Expected: 8 ETH minipool should be in the queue as initialised, deposit pool should contain 8 ETH
                        let status = await variableMinipool3.getStatus.call();
                        assertBN.equal(status, minipoolStates.Initialised, 'Incorrect minipool status');
                        assertBN.equal(await rocketDepositPool.getBalance(), '8'.ether, 'Incorrect deposit pool balance');
                    }

                    {
                        // Test: rETH burn with minipools in queue
                        await shouldRevert(burnReth('1'.ether, {from: random}), 'Was able to burn rETH', 'Insufficient ETH balance for exchange');
                        // Expected: rETH burn should fail, as there is no excess balance in the deposit pool
                    }

                    {
                        // Test: Deposit 24 ETH into deposit pool
                        await userDeposit({ from: random, value: '24'.ether });
                        // Expected: 8 ETH minipool assigned 31 ETH, 1 ETH remaining in the deposit pool
                        let status = await variableMinipool3.getStatus.call();
                        assertBN.equal(status, minipoolStates.Prelaunch, 'Incorrect minipool status');
                        assertBN.equal(await rocketDepositPool.getBalance(), '1'.ether, 'Incorrect deposit pool balance');
                    }

                    {
                        // Test: Burn 1 rETH with no minipools in queue
                        await burnReth('1'.ether, {from: random});
                        // Expected: rETH burn should success
                    }

                    // Dynamic Commmission Rate (regression test)

                    {
                        // Test: set a dynamic commission rate
                        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', '0.05'.ether, {from: owner});
                        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', '0.10'.ether, {from: owner});
                        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', '0.20'.ether, {from: owner});
                        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.demand.range', '5'.ether, {from: owner});
                    }

                    {
                        // Test: Set deposit limit to 5 ETH
                        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.pool.maximum', '5'.ether, {from: owner});
                        // Expected: Deposit limit should be 5 ETH
                        assertBN.equal(await rocketDepositPool.getMaximumDepositAmount(), '5'.ether, 'Invalid maximum deposit amount')
                    }

                    {
                        // Test: Deposit 5 ETH into deposit pool
                        await userDeposit({ from: random, value: '5'.ether });
                        // Expected: Deposit pool should contain 5 ETH and commission rate (RocketNetworkFees.getNodeFee()) should be at max (20%)
                        assertBN.equal(await rocketDepositPool.getBalance(), '5'.ether, 'Incorrect deposit pool balance');
                        assertBN.equal(await rocketNetworkFees.getNodeFee(), '0.20'.ether, 'Incorrect network node fee');
                    }

                    {
                        // Test: Deposit 8 ETH minipool
                        variableMinipool3 = await createMinipool({ from: node, value: '8'.ether });
                        // Expected: 8 ETH minipool should be in the queue, deposit pool balance should be 12 ETH, commission rate should be min (5%)
                        assertBN.equal(await rocketMinipoolQueue.getTotalLength(), '1', 'Invalid queue length')
                        assertBN.equal(await rocketDepositPool.getBalance(), '12'.ether, 'Incorrect deposit pool balance');
                        assertBN.equal(await rocketNetworkFees.getNodeFee(), '0.05'.ether, 'Incorrect network node fee');
                    }

                    {
                        // Test: Deposit 16 ETH into deposit pool
                        await userDeposit({ from: random, value: '16'.ether });
                        // Expected: Deposit pool should contain 28 ETH, commission rate should be 9%
                        assertBN.equal(await rocketMinipoolQueue.getTotalLength(), '1', 'Invalid queue length')
                        assertBN.equal(await rocketDepositPool.getBalance(), '28'.ether, 'Incorrect deposit pool balance');
                        assertBN.equal(await rocketNetworkFees.getNodeFee(), '0.0892'.ether, 'Incorrect network node fee');
                    }

                    {
                        // Test: Deposit 6 ETH into deposit pool
                        await userDeposit({ from: random, value: '6'.ether });
                        // Expected: 8 ETH minipool should be in prelaunch, deposit pool contains 3 ETH, commission rate should be 12%
                        assertBN.equal(await rocketMinipoolQueue.getTotalLength(), '0', 'Invalid queue length')
                        assertBN.equal(await rocketDepositPool.getBalance(), '3'.ether, 'Incorrect deposit pool balance');
                        assertBN.equal(await rocketNetworkFees.getNodeFee(), '0.1216'.ether, 'Incorrect network node fee');
                    }

                    {
                        // Reset commission to 14%
                        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', '0.14'.ether, {from: owner});
                        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', '0.14'.ether, {from: owner});
                        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', '0.14'.ether, {from: owner});
                        // Burn DP
                        await burnReth('3'.ether, {from: random});
                    }

                    // Migrations

                    {
                        // Test: Using a 16 ETH minipool (premigration), execute beginReduceBondAmount, wait timeout period, execute reduceBondAmount
                        // Expected: Should fail with not enough RPL stake
                        const minipool = await RocketMinipoolBase.at(queuedHalfMinipool1.address);
                        await minipool.delegateUpgrade({from: node});
                        await rocketMinipoolBondReducer.beginReduceBondAmount(queuedHalfMinipool1.address, '8'.ether, {from: node});
                        await increaseTime(web3, bondReductionWindowStart + 1);
                        await shouldRevert(queuedHalfMinipool1.reduceBondAmount({from: node}), 'Was able to reduce bond', 'ETH matched after deposit exceeds limit based on node RPL stake');
                    }

                    {
                        // Test: Stake RPL then using a 16 ETH minipool (premigration), execute beginReduceBondAmount, wait timeout period, execute reduceBondAmount
                        let rplStake = '80'.ether;
                        await mintRPL(owner, node, rplStake);
                        await nodeStakeRPL(rplStake, {from: node});
                        await queuedHalfMinipool1.reduceBondAmount({from: node});
                        // Expected: Node fee should be new fee, deposit type should be variable, node should have a credit for 8 ETH
                        assertBN.equal(await queuedHalfMinipool1.getNodeFee(), '0.14'.ether, 'Incorrect node fee');
                        assertBN.equal(await queuedHalfMinipool1.getDepositType(), '4'.BN, 'Incorrect deposit type');
                        assertBN.equal(await rocketNodeDeposit.getNodeDepositCredit(node), '8'.ether, 'Incorrect deposit credit balance');
                    }

                    {
                        // Test: Same node deposits new 8 ETH minipool, supplying 0 ETH
                        // Require deposit pool to have 1 ETH to avoid early revert
                        await userDeposit({ from: random, value: '1'.ether });
                        // Expected: Should fail with not enough RPL stake
                        await shouldRevert(createMinipoolWithBondAmount('8'.ether, { from: node, value: '0'.ether }), 'Was able to create new minipool', 'ETH matched after deposit exceeds limit based on node RPL stake');
                        // Remove the 1 ETH from the deposit pool
                        await burnReth('1'.ether, {from: random});
                    }

                    {
                        // Test: Stake RPL then same node deposits new 8 ETH minipool, supplying 0 ETH
                        let rplStake = '240'.ether;
                        await mintRPL(owner, node, rplStake);
                        await nodeStakeRPL(rplStake, {from: node});
                        // Expected: Should fail with empty DP
                        await shouldRevert(createMinipoolWithBondAmount('8'.ether, { from: node, value: '0'.ether }), 'Was able to create new minipool', 'Deposit pool balance is insufficient for pre deposit');
                    }

                    {
                        // Test: Deposit ETH then stake RPL then same node deposits new 8 ETH minipool, supplying 0 ETH
                        await userDeposit({ from: random, value: '1'.ether });
                        await createMinipoolWithBondAmount('8'.ether, { from: node, value: '0'.ether });
                        // Expected: Minipool deposit succeeded, credit should be 0, predeposit 1 ETH taken from deposit pool
                        assertBN.equal(await rocketMinipoolQueue.getTotalLength(), '1', 'Invalid queue length')
                        assertBN.equal(await rocketNodeDeposit.getNodeDepositCredit(node), '0'.ether, 'Incorrect deposit credit balance');
                        assertBN.equal(await rocketDepositPool.getBalance(), '0'.ether, 'Incorrect deposit pool balance');
                    }

                    {
                        // Test: Same node deposits new 8 ETH minipool, supplying 0 ETH
                        // Expected: Fails, as no more credit
                        await shouldRevert(createMinipoolWithBondAmount('8'.ether, { from: node, value: '0'.ether }), 'Was able to make new minipool with no credit', 'Invalid value');
                    }
                });
        });

        describe('Edge Cases', async () => {
            // Setup
            before(async () => {
                // Register node
                await registerNode({ from: node });

                // Register trusted node
                await registerNode({ from: trustedNode1 });
                await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);

                // Set settings
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, { from: owner });
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, { from: owner });
                await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, { from: owner });
                await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.start', bondReductionWindowStart, {from: owner});
                await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.length', bondReductionWindowLength, {from: owner});
            });


            it('Handles delegate upgrade of legacy minipool still in queue', async () => {
                // 1. Create 16 ETH minipool that sits in queue
                let rplStake = '1600'.ether;
                await mintRPL(owner, node, rplStake);
                await nodeStakeRPL(rplStake, {from: node});
                const minipool = await createMinipool({from: node, value: '16'.ether});
                assertBN.equal(await minipool.getStatus(), minipoolStates.Initialised, 'Incorrect minipool status');

                // 2. Upgrade
                await upgradeOneDotTwo(owner);

                // 3. Assign minipool
                await userDeposit({ from: random, value: '16'.ether });
                assertBN.equal(await minipool.getStatus(), minipoolStates.Prelaunch, 'Incorrect minipool status');

                // 4. Upgrade delegate
                const minipoolBase = await RocketMinipoolBase.at(minipool.address);
                await minipoolBase.delegateUpgrade({from: node});

                // 5. Attempt to stake
                await increaseTime(web3, scrubPeriod + 1);
                await stakeMinipool(minipool, {from: node});
            });


            it('Can create a minipool from deposit credit with zero node balance in deposit pool', async () => {
                // Get contracts
                const rocketTokenReth = await RocketTokenRETH.deployed();
                const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();

                // 1. Upgrade
                await upgradeOneDotTwo(owner);

                // 2. Stake enough for 2x LEB8s
                let rplStake = '4800'.ether;
                await mintRPL(owner, node, rplStake);
                await nodeStakeRPL(rplStake, {from: node});

                // 3. Create a 16 ETH minipool
                const minipool = await createMinipool({from: node, value: '16'.ether});
                await userDeposit({ from: random, value: '16'.ether });
                await increaseTime(web3, scrubPeriod + 1);
                await stakeMinipool(minipool, {from: node});

                // 4. Reduce bond
                await rocketMinipoolBondReducer.beginReduceBondAmount(minipool.address, '8'.ether, {from: node});
                await increaseTime(web3, bondReductionWindowStart + 1);
                await reduceBond(minipool, {from: node});

                // 5. Deposit 31 ETH into DP
                await userDeposit({ from: random, value: '32'.ether });

                // 6. Should be able to create a minipool and have it assigned
                const minipool2 = await createMinipoolWithBondAmount('8'.ether, {from: node, value: '0'.ether});
                assertBN.equal(await minipool2.getStatus(), minipoolStates.Prelaunch, 'Incorrect minipool status');
            });


            it('Stops node operator from withdrawing after rolling back an LEB8', async () => {
                // Get contracts
                const rocketTokenReth = await RocketTokenRETH.deployed();
                const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();

                // 1. Create 16 ETH minipool and progress to staking
                let rplStake = '1600'.ether;
                await mintRPL(owner, node, rplStake);
                await nodeStakeRPL(rplStake, {from: node});
                const minipool = await createMinipool({from: node, value: '16'.ether});
                assertBN.equal(await minipool.getStatus(), minipoolStates.Initialised, 'Incorrect minipool status');
                await userDeposit({ from: random, value: '16'.ether });
                assertBN.equal(await minipool.getStatus(), minipoolStates.Prelaunch, 'Incorrect minipool status');
                await increaseTime(web3, scrubPeriod + 1);
                await stakeMinipool(minipool, {from: node});

                // 2. Upgrade
                await upgradeOneDotTwo(owner);

                // 3. Upgrade delegate
                const minipoolBase = await RocketMinipoolBase.at(minipool.address);
                await minipoolBase.delegateUpgrade({from: node});

                // 4. Reduce bond
                await rocketMinipoolBondReducer.beginReduceBondAmount(minipool.address, '8'.ether, {from: node});
                await increaseTime(web3, bondReductionWindowStart + 1);
                await reduceBond(minipool, {from: node});

                // 5. Rollback delegate
                await minipoolBase.delegateRollback({from: node});
                assertBN.equal(await minipool.calculateNodeShare('32'.ether), '0'.ether, 'Incorrect node deposit balance');

                // 6. Try to distribute 32 ETH but receive nothing
                await web3.eth.sendTransaction({
                    from: owner,
                    to: minipool.address,
                    value: '32'.ether
                });
                const nodeBalance1 = await web3.eth.getBalance(node);
                const rethBalance1 = await web3.eth.getBalance(rocketTokenReth.address);
                await minipool.distributeBalance({ from: node });
                const nodeBalance2 = await web3.eth.getBalance(node);
                const rethBalance2 = await web3.eth.getBalance(rocketTokenReth.address);

                // Check balance changes
                assertBN.isAtMost(nodeBalance2, nodeBalance1, 'Node balance incorrect');
                assertBN.equal(rethBalance2.BN.sub(rethBalance1.BN), '32'.ether, 'User balance incorrect');
            });


            it('Handles legacy and variable minipools in the queue simultaneously', async () => {
                // Get contracts
                const rocketMinipoolQueue = await RocketMinipoolQueue.deployed();
                const rocketMinipoolQueueOld = await RocketMinipoolQueueOld.deployed();
                const rocketDepositPool = await RocketDepositPool.deployed();

                // Stake enough RPL to run a few minipools
                let rplStake = '1600'.ether.mul('10'.BN);
                await mintRPL(owner, node, rplStake);
                await nodeStakeRPL(rplStake, {from: node});

                // Create a few minipools
                const halfMinipools = [];
                halfMinipools.push(await createMinipool({from: node, value: '16'.ether}));
                halfMinipools.push(await createMinipool({from: node, value: '16'.ether}));
                const fullMinipools = [];
                fullMinipools.push(await createMinipool({from: node, value: '32'.ether}));
                fullMinipools.push(await createMinipool({from: node, value: '32'.ether}));
                assertBN.equal(await rocketMinipoolQueueOld.getTotalLength(), '4'.BN, 'Incorrect queue length');

                // Upgrade
                await upgradeOneDotTwo(owner);

                // User balance of deposit pool should be 0
                assertBN.equal(await rocketDepositPool.getUserBalance(), '0'.BN, 'Incorrect deposit pool user balance');
                assertBN.equal(await rocketDepositPool.getNodeBalance(), '0'.ether, 'Incorrect deposit pool node balance');

                // Create a few variable minipools
                const variableMinipools = [];
                variableMinipools.push(await createMinipool({from: node, value: '16'.ether}));
                assertBN.equal(await rocketDepositPool.getNodeBalance(), '15'.ether, 'Incorrect deposit pool node balance');
                assertBN.equal(await rocketMinipoolQueue.getTotalLength(), '5'.BN, 'Incorrect queue length');
                variableMinipools.push(await createMinipool({from: node, value: '8'.ether}));

                // The 16 ETH pool should have added 15 ETH to deposit pool, then LEB8 added 7 ETH which then would trigger assignment of first half pool with 16 ETH going to it
                assertBN.equal(await rocketDepositPool.getBalance(), '6'.ether, 'Incorrect deposit pool balance');

                // Check the queue
                async function checkQueue(expected) {
                    const actual = await Promise.all([...Array(expected.length).keys()].map(i => rocketMinipoolQueue.getMinipoolAt(i)));
                    for (let i = 0; i < expected.length; i++) {
                        assert.strictEqual(actual[i], expected[i].address, `Invalid minipool queue in position ${i}`);
                    }
                    const positions = await Promise.all(expected.map(minipool => rocketMinipoolQueue.getMinipoolPosition(minipool.address)));
                    for (let i = 0; i < expected.length; i++) {
                        assertBN.equal(positions[i], i.BN, 'Invalid minipool position');
                    }
                }
                assertBN.equal(await rocketMinipoolQueue.getTotalLength(), '5'.BN, 'Incorrect queue length');
                await checkQueue([halfMinipools[1], fullMinipools[0], fullMinipools[1], variableMinipools[0], variableMinipools[1]]);

                // Depositing 10 ETH should clear out the other half minipool and empty deposit pool
                await userDeposit({ from: random, value: '10'.ether });
                await checkQueue([fullMinipools[0], fullMinipools[1], variableMinipools[0], variableMinipools[1]]);
                assertBN.equal(await rocketDepositPool.getBalance(), '0'.ether, 'Incorrect deposit pool balance');

                // Depositing another 32 ETH should clear out the full minipools
                await userDeposit({ from: random, value: '32'.ether });
                await checkQueue([variableMinipools[0], variableMinipools[1]]);

                // Create a new 16 ETH minipool should add 15 ETH to deposit pool
                variableMinipools.push(await createMinipool({from: node, value: '16'.ether}));
                await checkQueue([variableMinipools[0], variableMinipools[1], variableMinipools[2]]);
                assertBN.equal(await rocketDepositPool.getBalance(), '15'.ether, 'Incorrect deposit pool balance');

                // Both variable minipools now require 31 ETH each to move to prelaunch so 15 ETH should do nothing to the queue
                await userDeposit({ from: random, value: '15'.ether });
                await checkQueue([variableMinipools[0], variableMinipools[1], variableMinipools[2]]);

                // 1 more ETH should assign the first minipool
                await userDeposit({ from: random, value: '1'.ether });
                await checkQueue([variableMinipools[1], variableMinipools[2]]);

                // 62 more ETH should clear the queue (2x 31 ETH)
                await userDeposit({ from: random, value: '62'.ether });
                assertBN.equal(await rocketMinipoolQueue.getTotalLength(), '0'.BN, 'Incorrect queue length');

                // Deposit pool should be empty
                assertBN.equal(await rocketDepositPool.getBalance(), '0'.BN, 'Incorrect deposit pool balance');
                assertBN.equal(await rocketDepositPool.getUserBalance(), '0'.BN, 'Incorrect deposit pool user balance');
                assertBN.equal(await rocketDepositPool.getNodeBalance(), '0'.BN, 'Incorrect deposit pool node balance');
            });


            it('Handles a legacy minipool that has been upgraded and dissolved', async () => {
                // Get contracts
                const rocketNodeStaking = await RocketNodeStaking.deployed();

                // 1. Create 16 ETH minipool and progress to prelaunch
                let rplStake = '1600'.ether;
                await mintRPL(owner, node, rplStake);
                await nodeStakeRPL(rplStake, {from: node});
                const minipool = await createMinipool({from: node, value: '16'.ether});
                assertBN.equal(await rocketNodeStaking.getNodeETHMatched(node), '16'.ether, 'Incorrect ETH matched');
                await userDeposit({ from: random, value: '16'.ether });
                await increaseTime(web3, launchTimeout + 1);

                // 2. Upgrade
                await upgradeOneDotTwo(owner);

                // 3. Upgrade delegate
                const minipoolBase = await RocketMinipoolBase.at(minipool.address);
                await minipoolBase.delegateUpgrade({from: node});

                // 4. Dissolve
                await dissolveMinipool(minipool, {from: node});

                // 5. Close pool
                await closeMinipool(minipool, {from :node});
                assertBN.equal(await rocketNodeStaking.getNodeETHMatched(node), '0'.ether, 'Incorrect ETH matched');
            });
        });
    })
}
