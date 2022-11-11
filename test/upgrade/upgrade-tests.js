import { nodeStakeRPL, registerNode, setNodeTrusted } from '../_helpers/node';
import { upgradeOneDotTwo } from '../_utils/upgrade';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { createMinipool, stakeMinipool } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsMinipool,
    RocketDepositPool,
} from '../_utils/artifacts';
import { increaseTime } from '../_utils/evm';
import { burnReth } from '../token/scenario-reth-burn';
import { shouldRevert } from '../_utils/testing';


export default function() {
    contract('RocketUpgradeOneDotTwo', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
            staker,
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

            // Stake RPL to cover minipools
            let rplStake = web3.utils.toBN(web3.utils.toWei('1360', 'ether'));
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Create minipools
            await userDeposit({ from: random, value: web3.utils.toWei('16', 'ether'), });
            stakingMinipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            queuedHalfMinipool1 = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            queuedHalfMinipool2 = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            queuedFullMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});

            // Wait required scrub period
            await increaseTime(web3, scrubPeriod + 1);

            // Progress minipools into desired statuses
            await stakeMinipool(stakingMinipool, {from: node});
            await stakeMinipool(queuedFullMinipool, {from: node});

            // Check minipool statuses
            let stakingStatus = await stakingMinipool.getStatus.call();
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            stakingStatus = await queuedFullMinipool.getStatus.call();
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            let initialisedStatus = await queuedHalfMinipool1.getStatus.call();
            assert(initialisedStatus.eq(web3.utils.toBN(0)), 'Incorrect initialised minipool status');
            initialisedStatus = await queuedHalfMinipool2.getStatus.call();
            assert(initialisedStatus.eq(web3.utils.toBN(0)), 'Incorrect initialised minipool status');

            // Check deposit pool balances
            const depositPoolBalance = await rocketDepositPool.getBalance();
            const depositPoolNodeBalance = await rocketDepositPool.getNodeBalance();
            assert(depositPoolBalance.eq(web3.utils.toBN('0')), 'Incorrect deposit pool balance');
            assert(depositPoolNodeBalance.eq(web3.utils.toBN('0')), 'Incorrect deposit pool node balance');

            // Perform upgrade
            await upgradeOneDotTwo(owner);
        });


        it('New Queue Tests (variable queue & queued ETH)',
            async () => {

                let variableMinipool1, variableMinipool2, variableMinipool3;

                {
                    // Test: Deposit 16 ETH into the deposit pool
                    await userDeposit({ from: random, value: web3.utils.toWei('16', 'ether') });
                    // Expected: 16 ETH is assigned to a legacy half minipool, which becomes prelaunch
                    let status = await queuedHalfMinipool1.getStatus.call();
                    assert(status.eq(web3.utils.toBN(1)), 'Incorrect minipool status');
                }

                {
                    // Test: Deposit 8 ETH minipool (with empty deposit pool)
                    variableMinipool1 = await createMinipool({ from: node, value: web3.utils.toWei('8', 'ether') });
                    // Expected: 1 ETH is deposited on beacon chain, minipool is in queue (initialised), 7 ETH is added to the deposit pool
                    let status = await variableMinipool1.getStatus.call();
                    assert(status.eq(web3.utils.toBN(0)), 'Incorrect minipool status');
                    const depositPoolBalance = await rocketDepositPool.getBalance();
                    assert(depositPoolBalance.eq(web3.utils.toBN(web3.utils.toWei('7', 'ether'))), 'Incorrect deposit pool balance');
                }

                {
                    // Test: Deposit 16 ETH minipool
                    const depositPoolBalanceBefore = await rocketDepositPool.getBalance();
                    variableMinipool2 = await createMinipool({ from: node, value: web3.utils.toWei('16', 'ether') });
                    const depositPoolBalanceAfter = await rocketDepositPool.getBalance();
                    // Expected: 1 ETH is deposited on beacon chain, minipool is in queue (initialised), 15 ETH is added to deposit pool, a half legacy minipool should be assigned 16 ETH and moves to prelaunch
                    let status = await variableMinipool2.getStatus.call();
                    assert(status.eq(web3.utils.toBN(0)), 'Incorrect minipool status');
                    // 15 ETH added to deposit pool and 16 ETH assigned to legacy half pool is 1 ETH less
                    assert(depositPoolBalanceAfter.eq(depositPoolBalanceBefore.sub(web3.utils.toBN(web3.utils.toWei('1', 'ether')))), 'Incorrect change in deposit pool balance');
                    status = await queuedHalfMinipool2.getStatus.call();
                    assert(status.eq(web3.utils.toBN(1)), 'Incorrect minipool status');
                }

                {
                    // Test: Deposit 10 ETH into deposit pool
                    await userDeposit({ from: random, value: web3.utils.toWei('10', 'ether') });
                    // Expected: Legacy full minipool should have a 16 ETH refund
                    const refund = await queuedFullMinipool.getNodeRefundBalance();
                    assert(refund.eq(web3.utils.toBN(web3.utils.toWei('16', 'ether'))), 'Invalid refund balance');
                }

                {
                    // Test: Deposit 31 ETH into deposit pool
                    await userDeposit({ from: random, value: web3.utils.toWei('31', 'ether') });
                    // Expected: 8 ETH minipool assigned 31 ETH deposit and moved to prelaunch
                    let status = await variableMinipool1.getStatus.call();
                    assert(status.eq(web3.utils.toBN(1)), 'Incorrect minipool status');
                }

                {
                    // Test: Deposit 20 ETH into deposit pool
                    await userDeposit({ from: random, value: web3.utils.toWei('20', 'ether') });
                    // Expected: 20 ETH in deposit pool, no assignments
                    let status = await variableMinipool2.getStatus.call();
                    assert(status.eq(web3.utils.toBN(0)), 'Incorrect minipool status');
                    const depositPoolBalance = await rocketDepositPool.getBalance();
                    assert(depositPoolBalance.eq(web3.utils.toBN(web3.utils.toWei('20', 'ether'))), 'Incorrect deposit pool balance');
                }

                {
                    // Test: Deposit 11 ETH into deposit pool
                    await userDeposit({ from: random, value: web3.utils.toWei('11', 'ether') });
                    // Expected: 16 ETH minipool assigned 31 ETH deposit and moved to prelaunch
                    let status = await variableMinipool2.getStatus.call();
                    assert(status.eq(web3.utils.toBN(1)), 'Incorrect minipool status');
                }

                {
                    // Test: Deposit 2 ETH into deposit pool
                    await userDeposit({ from: random, value: web3.utils.toWei('2', 'ether') });
                    // Expected: 2 ETH is in the deposit pool
                    const depositPoolBalance = await rocketDepositPool.getBalance();
                    assert(depositPoolBalance.eq(web3.utils.toBN(web3.utils.toWei('2', 'ether'))), 'Incorrect deposit pool balance');
                }

                {
                    // Test: Burn 1 rETH with no minipools in queue
                    await burnReth(web3.utils.toWei('1', 'ether'), {from: random});
                    // Expected: rETH burn should success
                }

                {
                    // Test: Deposit 8 ETH minipool
                    variableMinipool3 = await createMinipool({ from: node, value: web3.utils.toWei('8', 'ether') });
                    // Expected: 8 ETH minipool should be in the queue as initialised, deposit pool should contain 8 ETH
                    let status = await variableMinipool3.getStatus.call();
                    assert(status.eq(web3.utils.toBN(0)), 'Incorrect minipool status');
                    const depositPoolBalance = await rocketDepositPool.getBalance();
                    assert(depositPoolBalance.eq(web3.utils.toBN(web3.utils.toWei('8', 'ether'))), 'Incorrect deposit pool balance');
                }

                {
                    // Test: rETH burn with minipools in queue
                    await shouldRevert(burnReth(web3.utils.toWei('1', 'ether'), {from: random}), 'Was able to burn rETH', 'Insufficient ETH balance for exchange');
                    // Expected: rETH burn should fail, as there is no excess balance in the deposit pool
                }

                {
                    // Test: Deposit 24 ETH into deposit pool
                    await userDeposit({ from: random, value: web3.utils.toWei('24', 'ether') });
                    // Expected: 8 ETH minipool assigned 31 ETH, 1 ETH remaining in the deposit pool
                    let status = await variableMinipool3.getStatus.call();
                    assert(status.eq(web3.utils.toBN(1)), 'Incorrect minipool status');
                    const depositPoolBalance = await rocketDepositPool.getBalance();
                    assert(depositPoolBalance.eq(web3.utils.toBN(web3.utils.toWei('1', 'ether'))), 'Incorrect deposit pool balance');
                }

                {
                    // Test: Burn 1 rETH with no minipools in queue
                    await burnReth(web3.utils.toWei('1', 'ether'), {from: random});
                    // Expected: rETH burn should success
                }

            });

    })
}
