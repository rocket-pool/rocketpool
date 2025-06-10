import { before, describe, it } from 'mocha';
import { RocketDAONodeTrustedSettingsMinipool, RocketNodeStaking, StakeHelper } from '../_utils/artifacts';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    nodeStakeRPL,
    nodeStakeRPLFor,
    registerNode,
    setNodeRPLWithdrawalAddress,
    setNodeTrusted,
    setNodeWithdrawalAddress,
    setRPLLockingAllowed,
    setStakeRPLForAllowed,
    setStakeRPLForAllowedWithNodeAddress,
} from '../_helpers/node';
import { approveRPL, mintRPL } from '../_helpers/tokens';
import { stakeRpl } from './scenario-stake-rpl';
import { withdrawRpl, withdrawRplFor } from './scenario-withdraw-rpl';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { globalSnapShot, snapshotDescribe } from '../_utils/snapshotting';
import { unstakeRpl, unstakeRplFor } from './scenario-unstake-rpl';
import { assertBN } from '../_helpers/bn';
import { withdrawLegacyRpl, withdrawLegacyRplFor } from './scenario-withdraw-legacy-rpl';
import { randomAddress } from 'hardhat/internal/hardhat-network/provider/utils/random';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNodeStaking', () => {
        let owner,
            node,
            node2,
            trustedNode,
            random,
            rplWithdrawalAddress,
            withdrawalAddress;

        const scrubPeriod = (60 * 60 * 24); // 24 hours
        const userDistributeStartTime = 60 * 60 * 24 * 90; // 90 days

        // Setup
        let rocketNodeStaking;
        before(async () => {
            await globalSnapShot();
            [
                owner,
                node,
                node2,
                trustedNode,
                random,
                rplWithdrawalAddress,
                withdrawalAddress,
            ] = await ethers.getSigners();
            // Load contracts
            rocketNodeStaking = await RocketNodeStaking.deployed();
            // Set settings
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, { from: owner });
            // Register node
            await registerNode({ from: node });
            await registerNode({ from: node2 });
            // Register trusted node
            await registerNode({ from: trustedNode });
            await setNodeTrusted(trustedNode, 'saas_1', 'node1@home.com', owner);
            // Mint RPL to accounts
            const rplAmount = '10000'.ether;
            await mintRPL(owner, node, rplAmount);
            await mintRPL(owner, node2, rplAmount);
            await mintRPL(owner, random, rplAmount);
            await mintRPL(owner, rplWithdrawalAddress, rplAmount);
            await mintRPL(owner, withdrawalAddress, rplAmount);
        });

        // Helpers

        async function assertBalances(node, legacy, megapool) {
            const legacyStakedRPL = await rocketNodeStaking.getNodeLegacyStakedRPL(node);
            const megapoolStakedRPL = await rocketNodeStaking.getNodeMegapoolStakedRPL(node);
            const stakedRPL = await rocketNodeStaking.getNodeStakedRPL(node);
            assertBN.equal(legacyStakedRPL, legacy);
            assertBN.equal(stakedRPL, legacy + megapool);
            assertBN.equal(megapoolStakedRPL, megapool);
        }

        it(printTitle('node operator', 'can stake RPL'), async () => {
            // Set parameters
            const rplAmount = '5000'.ether;
            // Approve transfer & stake RPL once
            await approveRPL(rocketNodeStaking.target, rplAmount, { from: node });
            await stakeRpl(rplAmount, { from: node });
            // Approve transfer & stake RPL twice
            await approveRPL(rocketNodeStaking.target, rplAmount, { from: node });
            await stakeRpl(rplAmount, { from: node });
            // Assert balances
            await assertBalances(node, 0n, rplAmount * 2n);
        });

        it(printTitle('random address', 'cannot stake RPL'), async () => {
            // Set parameters
            const rplAmount = '10000'.ether;
            // Approve transfer & attempt to stake RPL
            await approveRPL(rocketNodeStaking.target, rplAmount, { from: node });
            await shouldRevert(
                stakeRpl(rplAmount, { from: random }),
                'Random address staked RPL',
            );
        });

        it(printTitle('node operator', 'cannot withdraw staked RPL'), async () => {
            // Set parameters
            const rplAmount = '10000'.ether;
            // Stake RPL
            await nodeStakeRPL(rplAmount, { from: node });
            // Withdraw staked RPL
            await shouldRevert(
                withdrawRpl({ from: node }),
                'Was able to withdraw RPL',
                'No available unstaking RPL to withdraw',
            );
            // Assert balances
            await assertBalances(node, 0n, rplAmount);
        });

        it(printTitle('node operator', 'cannot withdraw megapool RPL as legacy RPL'), async () => {
            const rplAmount = '100'.ether;
            // Stake 1000 megapool RPL
            await nodeStakeRPL(rplAmount, { from: node });
            // Fail to withdraw legacy RPL
            await shouldRevert(
                withdrawLegacyRpl(rplAmount, { from: node }),
                'Was able to withdraw legacy RPL',
                'Insufficient legacy staked RPL',
            );
            // Assert balances
            await assertBalances(node, 0n, rplAmount);
        });

        it(printTitle('node operator', 'cannot unstake more RPL than staked'), async () => {
            // Stake 10 megapool RPL
            await nodeStakeRPL('10'.ether, { from: node });
            // Try to unstake
            await shouldRevert(unstakeRpl('10000'.ether, {
                from: node,
            }), 'Was able to unstake more RPL than staked', 'Insufficient RPL stake to reduce');
            // Assert balances
            await assertBalances(node, 0n, '10'.ether);
        });

        it(printTitle('node operator', 'cannot unstake RPL that is locked'), async () => {
            // Stake megapool 100 RPL
            await nodeStakeRPL('100'.ether, { from: node });
            // Lock 50 RPL
            const stakeHelper = await StakeHelper.deployed();
            await setRPLLockingAllowed(node.address, true, { from: node });
            await stakeHelper.lockRPL(node.address, '50'.ether);
            // Fail to unstake 100 megapool RPL
            await shouldRevert(
                unstakeRpl('100'.ether, { from: node }),
                'Was able to unstake more than available',
                'Insufficient RPL stake to reduce',
            );
            // Unstake 50 megapool RPL
            await unstakeRpl('50'.ether, { from: node });
            // Unlock the other 50 RPL
            await stakeHelper.unlockRPL(node.address, '50'.ether);
            // Unstake 50 megapool RPL
            await unstakeRpl('50'.ether, { from: node });
            // Assert balances
            await assertBalances(node, 0n, 0n);
        });

        it(printTitle('node operator', 'can unstake RPL'), async () => {
            // Stake 10,000 megapool RPL
            const rplAmount = '10000'.ether;
            await nodeStakeRPL(rplAmount, { from: node });
            // Withdraw staked megapool RPL
            await unstakeRpl(rplAmount, { from: node });
            // Assert balances
            await assertBalances(node, 0n, 0n);
        });

        it(printTitle('node operator', 'can unstake RPL from RPL withdrawal address'), async () => {
            // Stake 10,000 megapool RPL
            const rplAmount = '10000'.ether;
            await nodeStakeRPL(rplAmount, { from: node });
            // Withdraw staked megapool RPL
            await setNodeRPLWithdrawalAddress(node, rplWithdrawalAddress, { from: node });
            await unstakeRplFor(rplAmount, node.address, rplWithdrawalAddress);
            // Assert balances
            await assertBalances(node, 0n, 0n);
        });

        it(printTitle('random', 'can not unstake RPL for node operator'), async () => {
            // Stake 10,000 megapool RPL
            const rplAmount = '10000'.ether;
            await nodeStakeRPL(rplAmount, { from: node });
            // Withdraw staked megapool RPL
            await setNodeRPLWithdrawalAddress(node, rplWithdrawalAddress, { from: node });
            await shouldRevert(
                unstakeRplFor(rplAmount, node.address, random),
                'Unstaked with random account',
                'Not allowed to unstake for'
            );
            // Assert balances
            await assertBalances(rplWithdrawalAddress.address, 0n, 0n);
        });

        it(printTitle('node operator', 'can withdraw unstaked RPL after waiting 28 days'), async () => {
            // Stake 10,000 megapool RPL
            await nodeStakeRPL('10000'.ether, { from: node });
            // Unstake 500 megapool RPL
            await unstakeRpl('500'.ether, {
                from: node,
            });
            // Fail to withdraw immediately
            await shouldRevert(
                withdrawRpl({ from: node }),
                'Was able to immediately withdraw RPL',
                'No available unstaking RPL to withdraw',
            );
            // Wait 28 days
            await helpers.time.increase(60 * 60 * 24 * 28 + 1);
            // Can now withdraw the 500 megapool RPL
            await withdrawRpl({ from: node });
            // Assert balances
            await assertBalances(node, 0n, '10000'.ether - '500'.ether);
        });

        it(printTitle('node operator', 'can withdraw unstaked RPL from RPL withdrawal address after waiting 28 days'), async () => {
            // Stake 10,000 megapool RPL
            await nodeStakeRPL('10000'.ether, { from: node });
            // Unstake 500 megapool RPL
            await unstakeRpl('500'.ether, {
                from: node,
            });
            // Fail to withdraw immediately
            await setNodeRPLWithdrawalAddress(node, rplWithdrawalAddress, { from: node });
            await shouldRevert(
                withdrawRplFor(node, rplWithdrawalAddress),
                'Was able to immediately withdraw RPL',
                'No available unstaking RPL to withdraw',
            );
            // Wait 28 days
            await helpers.time.increase(60 * 60 * 24 * 28 + 1);
            // Can now withdraw the 500 megapool RPL
            await withdrawRplFor(node, rplWithdrawalAddress, { from: node });
            // Assert balances
            await assertBalances(node, 0n, '10000'.ether - '500'.ether);
        });

        it(printTitle('random address', 'cannot stake on behalf of a node without allowance'), async () => {
            await shouldRevert(
                nodeStakeRPLFor(node, '10000'.ether, { from: random }),
                'Was able to stake',
                'Not allowed to stake for',
            );
        });

        it(printTitle('random address', 'can stake on behalf of a node with allowance'), async () => {
            // Set parameters
            const rplAmount = '10000'.ether;
            // Allow
            await setStakeRPLForAllowed(random, true, { from: node });
            // Stake RPL
            await nodeStakeRPLFor(node, rplAmount, { from: random });
            // Assert balances
            await assertBalances(node, 0n, rplAmount);
        });

        it(printTitle('random address', 'can stake on behalf of a node with allowance from withdrawal address'), async () => {
            // Set parameters
            const rplAmount = '10000'.ether;
            // Set RPL withdrawal address
            await setNodeRPLWithdrawalAddress(node, rplWithdrawalAddress, { from: node });
            // Not allowed to set from node address any more
            await shouldRevert(
                setStakeRPLForAllowed(random, true, { from: node }),
                'Was able to allow',
                'Must be called from RPL withdrawal address',
            );
            // Allow from RPL withdrawal address
            await setStakeRPLForAllowedWithNodeAddress(node, random, true, { from: rplWithdrawalAddress });
            // Stake RPL
            await nodeStakeRPLFor(node, rplAmount, { from: random });
            // Assert balances
            await assertBalances(node, 0n, rplAmount);
        });

        it(printTitle('node operator', 'cannot stake from node address once RPL withdrawal address is set'), async () => {
            // Set RPL withdrawal address
            await setNodeRPLWithdrawalAddress(node, rplWithdrawalAddress, { from: node });
            // Stake RPL
            await shouldRevert(
                nodeStakeRPL('10000'.ether, { from: node }),
                'Was able to stake',
                'Not allowed to stake for',
            );
        });

        it(printTitle('node operator', 'can stake from primary withdrawal address'), async () => {
            // Set parameters
            const rplAmount = '10000'.ether;
            // Set RPL withdrawal address
            await setNodeWithdrawalAddress(node, withdrawalAddress, { from: node });
            // Stake RPL
            await nodeStakeRPLFor(node, rplAmount, { from: withdrawalAddress });
            // Assert balances
            await assertBalances(node, 0n, rplAmount);
        });

        it(printTitle('node operator', 'can stake from RPL withdrawal address'), async () => {
            // Set parameters
            const rplAmount = '10000'.ether;
            // Set RPL withdrawal address
            await setNodeRPLWithdrawalAddress(node, rplWithdrawalAddress, { from: node });
            // Stake RPL
            await nodeStakeRPLFor(node, rplAmount, { from: rplWithdrawalAddress });
            // Assert balances
            await assertBalances(node, 0n, rplAmount);
        });

        it(printTitle('misc', 'can transfer amounts between nodes'), async () => {
            // Stake 100 RPL from both nodes
            const rplAmount = '100'.ether;
            await nodeStakeRPL(rplAmount, { from: node });
            await nodeStakeRPL(rplAmount, { from: node2 });
            // Transfer 50 from one to another
            const stakeHelper = await StakeHelper.deployed();
            await stakeHelper.transferRPL(node.address, node2.address, '50'.ether);
            // Try to unstake 100 from first node
            await shouldRevert(
                unstakeRpl('100'.ether, { from: node }),
                'Was able to unstake more RPL than staked',
                'Insufficient RPL stake to reduce',
            );
            // Unstake 50 megapool RPL from first node
            await unstakeRpl('50'.ether, { from: node });
            // Unstake 150 megapool RPL from second node
            await unstakeRpl('150'.ether, { from: node2 });
            // Assert balances
            await assertBalances(node, 0n, 0n);
            await assertBalances(node2, 0n, 0n);
        });

        it(printTitle('misc', 'cannot lock unstaking RPL'), async () => {
            // Stake 100 RPL
            const rplAmount = '100'.ether;
            await nodeStakeRPL(rplAmount, { from: node });
            // Unstake 50 RPL
            await unstakeRpl('50'.ether, {
                from: node,
            });
            // Try to lock 100 RPL
            const stakeHelper = await StakeHelper.deployed();
            await setRPLLockingAllowed(node.address, true, { from: node });
            await shouldRevert(
                stakeHelper.lockRPL(node.address, '100'.ether),
                'Was able to lock unstaking RPL',
                'Not enough staked RPL',
            );
            // Try to lock 50 RPL
            await stakeHelper.lockRPL(node.address, '50'.ether);
            // Assert balances
            await assertBalances(node, 0n, '50'.ether);
        });

        it(printTitle('misc', 'can burn RPL'), async () => {
            // Stake 100 RPL
            const rplAmount = '100'.ether;
            await nodeStakeRPL(rplAmount, { from: node });
            // Burn 50 RPL
            const stakeHelper = await StakeHelper.deployed();
            await stakeHelper.burnRPL(node.address, '50'.ether);
            // Try to unstake 100 RPL
            await shouldRevert(
                unstakeRpl('100'.ether, { from: node }),
                'Was able to unstake more RPL than staked',
                'Insufficient RPL stake to reduce',
            );
            // Try to unstake 50 RPL
            await unstakeRpl('50'.ether, {
                from: node,
            });
            // Assert balances
            await assertBalances(node, 0n, 0n);
        });

        snapshotDescribe('With 1000 legacy staked RPL', () => {
            const legacyAmount = '1000'.ether;

            before(async () => {
                // Add 100 RPL as legacy staked by node
                const stakeHelper = await StakeHelper.deployed();
                await mintRPL(owner, owner, legacyAmount);
                await approveRPL(stakeHelper.target, legacyAmount, { from: owner });
                await stakeHelper.addLegacyStakedRPL(node.address, legacyAmount);
                // Assert expected balances
                await assertBalances(node, legacyAmount, 0n);
            });

            it(printTitle('node operator', 'can withdraw legacy RPL'), async () => {
                await withdrawLegacyRpl(legacyAmount, { from: node });
            });

            it(printTitle('node operator', 'can withdraw legacy RPL from RPL withdrawal address'), async () => {
                await setNodeRPLWithdrawalAddress(node, rplWithdrawalAddress, { from: node });
                await withdrawLegacyRplFor(legacyAmount, node.address, rplWithdrawalAddress);
            });

            it(printTitle('random', 'can not withdraw legacy RPL for node operator'), async () => {
                await shouldRevert(
                    withdrawLegacyRplFor(legacyAmount, node.address, random),
                    'Was able to withdraw from random account',
                    'Not allowed to withdraw for'
                );
            });

            it(printTitle('node operator', 'cannot unstake legacy staked RPL'), async () => {
                await shouldRevert(
                    unstakeRpl('1'.ether, { from: node }),
                    'Was able to unstake legacy staked RPL',
                    'Insufficient RPL stake to reduce',
                );
            });

            it(printTitle('node operator', 'cannot withdraw legacy staked RPL as megapool staked RPL'), async () => {
                await shouldRevert(
                    withdrawRpl({ from: node }),
                    'Was able to withdraw legacy staked RPL as megapool staked RPL',
                    'No available unstaking RPL to withdraw',
                );
            });

            it(printTitle('node operator', 'can stake megapool staked RPL and then withdraw'), async () => {
                // Stake 1000 megapool staked RPL
                await nodeStakeRPL('1000'.ether, { from: node });
                // NO now has 1000 legacy and 1000 megapool
                // Unstake 500 megapool
                await unstakeRpl('500'.ether, { from: node });
                // Withdraw 500 legacy
                await withdrawLegacyRpl('500'.ether, { from: node });
                // Wait 28 days
                await helpers.time.increase(60 * 60 * 24 * 28 + 1);
                // Withdraw the 500 megapool staked
                await withdrawRpl({ from: node });
                // NO should now have 500 legacy and 500 megapool
                await assertBalances(node, '500'.ether, '500'.ether);
            });

            it(printTitle('node operator', 'can withdraw unlocked legacy RPL'), async () => {
                // Stake 1000 RPL
                const rplAmount = '1000'.ether;
                await nodeStakeRPL(rplAmount, { from: node });
                // Lock 1500 RPL
                const stakeHelper = await StakeHelper.deployed();
                await setRPLLockingAllowed(node.address, true, { from: node });
                await stakeHelper.lockRPL(node.address, '1500'.ether);
                // NO should have 1000 legacy staked RPL, 1000 megapool staked RPL, and 1500 locked RPL, leaving 500 left to unstake
                // Try to withdraw 1000 legacy RPL
                await shouldRevert(
                    withdrawLegacyRpl('1000'.ether, { from: node }),
                    'Was able to unstake more than available',
                    'Insufficient RPL stake to reduce',
                );
                // Try to withdraw 500 legacy RPL
                await withdrawLegacyRpl('500'.ether, { from: node });
                // Fail to unstake 500 megapool RPL
                await shouldRevert(
                    unstakeRpl('500'.ether, { from: node }),
                    'Was able to unstake megapool RPL',
                    'Insufficient RPL stake to reduce',
                );
                // Unlock the RPL
                await stakeHelper.unlockRPL(node.address, '1500'.ether);
                // Unstake the RPL
                await unstakeRpl('500'.ether, { from: node });
                // Should have 500 of each now
                await assertBalances(node, '500'.ether, '500'.ether);
            });

            it(printTitle('node operator', 'can withdraw unlocked megapool RPL'), async () => {
                // Stake 1000 RPL
                const rplAmount = '1000'.ether;
                await nodeStakeRPL(rplAmount, { from: node });
                // Lock 1500 RPL
                const stakeHelper = await StakeHelper.deployed();
                await setRPLLockingAllowed(node.address, true, { from: node });
                await stakeHelper.lockRPL(node.address, '1500'.ether);
                // NO should have 1000 legacy staked RPL, 1000 megapool staked RPL, and 1500 locked RPL, leaving 500 left to unstake
                // Fail to unstake 1000 megapool RPL
                await shouldRevert(
                    unstakeRpl('1000'.ether, { from: node }),
                    'Was able to unstake more than available',
                    'Insufficient RPL stake to reduce',
                );
                // Try to unstake 500 RPL
                await unstakeRpl('500'.ether, { from: node });
                // Fail to withdraw 500 legacy RPL
                await shouldRevert(
                    withdrawLegacyRpl('500'.ether, { from: node }),
                    'Was able to withdraw legacy RPL',
                    'Insufficient RPL stake to reduce',
                );
                // Unlock the RPL
                await stakeHelper.unlockRPL(node.address, '1500'.ether);
                // Withdraw as legacy RPL
                await withdrawLegacyRpl('500'.ether, { from: node });
                // Should have 500 of each now
                await assertBalances(node, '500'.ether, '500'.ether);
            });

            it(printTitle('misc', 'can transfer a combination of legacy and megapool staked RPL between nodes'), async () => {
                // Stake 1000 RPL
                const rplAmount = '1000'.ether;
                await nodeStakeRPL(rplAmount, { from: node });
                // Transfer 1500 RPL to another node, this should transfer 1000 legacy and 500 megapool
                const stakeHelper = await StakeHelper.deployed();
                await stakeHelper.transferRPL(node.address, node2.address, '1500'.ether);
                // First node should have 500 megapool, second node should now have 1500 megapool
                await assertBalances(node, 0n, '500'.ether);
                await assertBalances(node2, 0n, '1500'.ether);
            });
        });
    });
}
