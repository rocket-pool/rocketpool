import { nodeStakeRPL, registerNode, setNodeTrusted } from '../_helpers/node';
import { upgradeOneDotTwo } from '../_utils/upgrade';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { createMinipool, minipoolStates, stakeMinipool } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsMinipool,
    RocketDepositPool, RocketMinipoolBase, RocketMinipoolQueue, RocketMinipoolQueueOld, RocketTokenRETH,
} from '../_utils/artifacts';
import { increaseTime } from '../_utils/evm';
import { burnReth } from '../token/scenario-reth-burn';
import { shouldRevert } from '../_utils/testing';
import { assertBN } from '../_helpers/bn';
import { reduceBond } from '../minipool/scenario-reduce-bond';


export default function() {
    contract('RocketUpgradeOneDotTwo', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
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

            // Setup
            before(async () => {
                rocketDepositPool = await RocketDepositPool.deployed();

                // Register node
                await registerNode({from: node});

                // Register trusted node
                await registerNode({from: trustedNode});
                await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

                // Set settings
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, {from: owner});
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, {from: owner});
                await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});
                await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.start', bondReductionWindowStart, {from: owner});
                await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.length', bondReductionWindowLength, {from: owner});

                // Stake RPL to cover minipools
                let rplStake = '1360'.ether;
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


            it('New Queue Tests (variable queue & queued ETH)',
                async () => {

                    let variableMinipool1, variableMinipool2, variableMinipool3;

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

                    {
                        // Test: Burn 1 rETH with no minipools in queue
                        await burnReth('1'.ether, {from: random});
                        // Expected: rETH burn should success
                    }

                    {
                        // Test: Deposit 8 ETH minipool
                        variableMinipool3 = await createMinipool({ from: node, value: '8'.ether });
                        // Expected: 8 ETH minipool should be in the queue as initialised, deposit pool should contain 8 ETH
                        let status = await variableMinipool3.getStatus.call();
                        assertBN.equal(status, minipoolStates.Initialised, 'Incorrect minipool status');
                        const depositPoolBalance = await rocketDepositPool.getBalance();
                        assertBN.equal(depositPoolBalance, '8'.ether, 'Incorrect deposit pool balance');
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
                        const depositPoolBalance = await rocketDepositPool.getBalance();
                        assertBN.equal(depositPoolBalance, '1'.ether, 'Incorrect deposit pool balance');
                    }

                    {
                        // Test: Burn 1 rETH with no minipools in queue
                        await burnReth('1'.ether, {from: random});
                        // Expected: rETH burn should success
                    }

                });
        });

        describe('Edge Cases', async () => {
            // Setup
            before(async () => {
                // Register node
                await registerNode({ from: node });

                // Register trusted node
                await registerNode({ from: trustedNode });
                await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

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


            it('Stops node operator from withdrawing after rolling back an LEB8', async () => {
                // Get contracts
                const rocketTokenReth = await RocketTokenRETH.deployed();

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
                await minipool.beginReduceBondAmount({from: node});
                await increaseTime(web3, bondReductionWindowStart + 1);
                await reduceBond(minipool, '8'.ether, {from: node});

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


            it.only('Handles legacy and variable minipools in the queue simultaneously', async () => {
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

                // Create a few variable minipools
                const variableMinipools = [];
                variableMinipools.push(await createMinipool({from: node, value: '16'.ether}));
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
                assertBN.equal(await rocketDepositPool.getUserBalance(), '0'.BN, 'Incorrect deposit pool user balance');
                assertBN.equal(await rocketDepositPool.getNodeBalance(), '0'.BN, 'Incorrect deposit pool node balance');
            });
        });
    })
}
