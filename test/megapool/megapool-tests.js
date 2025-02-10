import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { nodeDepositEthFor, registerNode, setNodeWithdrawalAddress } from '../_helpers/node';
import { globalSnapShot } from '../_utils/snapshotting';
import { userDeposit } from '../_helpers/deposit';
import {
    calculatePositionInQueue,
    deployMegapool,
    getMegapoolForNode,
    getValidatorInfo,
    nodeDeposit,
} from '../_helpers/megapool';
import { shouldRevert } from '../_utils/testing';
import {
    BeaconStateVerifier,
    MegapoolUpgradeHelper,
    RocketDAOProtocolSettingsDeposit,
    RocketDAOProtocolSettingsMegapool,
    RocketDepositPool,
    RocketMegapoolDelegate,
    RocketMegapoolFactory,
    RocketStorage,
} from '../_utils/artifacts';
import assert from 'assert';
import { stakeMegapoolValidator } from './scenario-stake';
import { assertBN } from '../_helpers/bn';
import { exitQueue } from './scenario-exit-queue';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { distributeMegapool } from './scenario-distribute';
import { withdrawCredit } from './scenario-withdraw-credit';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('Megapools', () => {
        let owner,
            node,
            node2,
            nodeWithdrawalAddress,
            random;

        let megapool;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                node2,
                nodeWithdrawalAddress,
                random,
            ] = await ethers.getSigners();

            // Register node & set withdrawal address
            await registerNode({ from: node });
            await setNodeWithdrawalAddress(node, nodeWithdrawalAddress, { from: node });
            await registerNode({ from: node2 });

            megapool = await getMegapoolForNode(node);

            // Disable proof verification
            const beaconStateVerifier = await BeaconStateVerifier.deployed();
            await beaconStateVerifier.setDisabled(true);
        });

        //
        // Factory
        //

        it(printTitle('owner', 'can not initialise megapool factory again'), async () => {
            const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
            await shouldRevert(rocketMegapoolFactory.initialise(), 'Was able to initialise factory', 'Invalid or outdated network contract');
        });

        //
        // General
        //

        it(printTitle('node', 'can not upgrade to current delegate'), async () => {
            await deployMegapool({ from: node });
            await shouldRevert(megapool.delegateUpgrade(), 'Was able to upgrade delegate', 'Already using latest');
        });

        it(printTitle('random', 'can not manually deploy a megapool'), async () => {
            await shouldRevert(deployMegapool({ from: random }), 'Deployed megapool', 'Invalid node');
        });

        it(printTitle('node', 'can manually deploy a megapool then deposit'), async () => {
            await deployMegapool({ from: node });
            await nodeDeposit(node);
        });

        it(printTitle('node', 'can deposit using supplied ETH'), async () => {
            await nodeDepositEthFor(node, { from: random, value: '4'.ether });
            await nodeDeposit(node, '4'.ether, false, '4'.ether);
        });

        it(printTitle('node', 'can deposit using ETH credit'), async () => {
            // Enter and exit queue to receive a 4 ETH credit
            await nodeDeposit(node, '4'.ether);
            await exitQueue(node, 0);
            // Use credit on entering the queue again
            await nodeDeposit(node, '4'.ether, false, '4'.ether);
        });

        it(printTitle('node', 'can not deploy megapool twice'), async () => {
            await deployMegapool({ from: node });
            await shouldRevert(deployMegapool({ from: node }), 'Redeploy worked');
        });

        it(printTitle('node', 'can exit the deposit queue and withdraw credit as rETH'), async () => {
            await deployMegapool({ from: node });
            await nodeDeposit(node);
            await exitQueue(node, 0);
            // Withdraw 1 ETH worth of rETH
            await withdrawCredit(node, '1'.ether);
            // Fail to withdraw 4 ETH worth of rETH
            await shouldRevert(withdrawCredit(node, '4'.ether), 'Withdrew more rETH than credit', 'Amount exceeds credit available');
        });

        it(printTitle('node', 'can queue up and exit multiple validators'), async () => {
            const rocketDepositPool = await RocketDepositPool.deployed();

            const numValidators = 5;

            await deployMegapool({ from: node });

            for (let i = 0; i < numValidators; i++) {
                await nodeDeposit(node);

                const position = await calculatePositionInQueue(megapool, i);
                assertBN.equal(position, BigInt(i));
            }

            // Check queue top is correct
            const queueTop = await rocketDepositPool.getQueueTop();
            assertBN.equal(queueTop[2], BigInt(await ethers.provider.getBlockNumber() - numValidators + 1));

            for (let i = 0; i < numValidators; i++) {
                await exitQueue(node, i);

                // Check queue top
                const queueTop = await rocketDepositPool.getQueueTop();
                if (queueTop[1]) {
                    assertBN.equal(queueTop[2], BigInt(await ethers.provider.getBlockNumber()));
                }
            }
        });

        it(printTitle('misc', 'calculates position in queue correctly'), async () => {
            const rocketDepositPool = await RocketDepositPool.deployed();

            /**
             * We will add 5 validators to the queue, 2 of which using an express ticket.
             *
             * The queue should end up looking like this:
             *
             * 0: node-1 (express)
             * 1: node-2 (express)
             * 2: node-0
             * 3: node-3
             * 4: node-4
             */

            await nodeDeposit(node); // 0
            await nodeDeposit(node, '4'.ether, true);  // 1 (express)
            await nodeDeposit(node, '4'.ether, true);  // 2 (express)
            await nodeDeposit(node); // 3
            await nodeDeposit(node); // 4

            assertBN.equal(await calculatePositionInQueue(megapool, 1n), 0n);
            assertBN.equal(await calculatePositionInQueue(megapool, 2n), 1n);
            assertBN.equal(await calculatePositionInQueue(megapool, 0n), 2n);
            assertBN.equal(await calculatePositionInQueue(megapool, 3n), 3n);
            assertBN.equal(await calculatePositionInQueue(megapool, 4n), 4n);

            // Assign one of the validators and re-check positions
            await userDeposit({ from: random, value: '32'.ether });

            // Validator at the top of the queue should be assigned now (in prestake)
            const info = await getValidatorInfo(megapool, 1n);
            assert.equal(info.inPrestake, true);

            /**
             * Queue should now look like:
             *
             * 0: node-2 (express)
             * 1: node-0
             * 2: node-3
             * 3: node-4
             */

            // Should not be in the queue anymore
            assert.equal(await calculatePositionInQueue(megapool, 1n), null);

            assertBN.equal(await calculatePositionInQueue(megapool, 2n), 0n);
            assertBN.equal(await calculatePositionInQueue(megapool, 0n), 1n);
            assertBN.equal(await calculatePositionInQueue(megapool, 3n), 2n);
            assertBN.equal(await calculatePositionInQueue(megapool, 4n), 3n);

            // Prevent new node deposits from assigning and messing up the queue for our test
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.assign.enabled', false, { from: owner });

            // Add 2 more validators in the express queue
            await nodeDeposit(node2, '4'.ether, true);
            await nodeDeposit(node2, '4'.ether, true);
            const megapool2 = await getMegapoolForNode(node2);

            /**
             * As we just assigned a validator in the express queue, so there should be another express queue on top
             * followed by a standard, then the 2 new express queue validators
             *
             * Therefore, the queue should now look like:
             *
             * 0: node-2 (express)
             * 1: node-0
             * 2: node2-0 (express)
             * 3: node2-1 (express)
             * 4: node-3
             * 5: node-4
             */

            assertBN.equal(await calculatePositionInQueue(megapool, 2n), 0n);
            assertBN.equal(await calculatePositionInQueue(megapool, 0n), 1n);
            assertBN.equal(await calculatePositionInQueue(megapool2, 0n), 2n);
            assertBN.equal(await calculatePositionInQueue(megapool2, 1n), 3n);
            assertBN.equal(await calculatePositionInQueue(megapool, 3n), 4n);
            assertBN.equal(await calculatePositionInQueue(megapool, 4n), 5n);

            // Assign another validator
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.assign.enabled', true, { from: owner });
            await userDeposit({ from: random, value: '32'.ether });

            /**
             * The queue should now look like:
             *
             * 0: node-0
             * 1: node2-0 (express)
             * 2: node2-1 (express)
             * 3: node-3
             * 4: node-4
             */

            assertBN.equal(await calculatePositionInQueue(megapool, 0n), 0n);
            assertBN.equal(await calculatePositionInQueue(megapool2, 0n), 1n);
            assertBN.equal(await calculatePositionInQueue(megapool2, 1n), 2n);
            assertBN.equal(await calculatePositionInQueue(megapool, 3n), 3n);
            assertBN.equal(await calculatePositionInQueue(megapool, 4n), 4n);
        });

        describe('With full deposit pool', () => {
            const dissolvePeriod = (60 * 60 * 48); // 24 hours

            before(async () => {
                // Deposit ETH into deposit pool
                await userDeposit({ from: random, value: '32'.ether });
                // Set time before dissolve
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMegapool, 'megapool.time.before.dissolve', dissolvePeriod, { from: owner });
            });

            it(printTitle('node', 'can deposit while assignments are disabled and be assigned once enabled again'), async () => {
                const rocketDepositPool = await RocketDepositPool.deployed();
                // Disable deposit assignments
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.assign.enabled', false, { from: owner });
                // Deploy a validator
                await deployMegapool({ from: node });
                await nodeDeposit(node);
                const topBefore = await rocketDepositPool.getQueueTop();
                assert.equal(topBefore[1], false);
                // Check the validator is still in the queue
                const megapool = await getMegapoolForNode(node);
                const validatorInfoBefore = await megapool.getValidatorInfo(0);
                assert.equal(validatorInfoBefore.inQueue, true);
                // Enable assignments
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.assign.enabled', true, { from: owner });
                // Check queue top is now assignable
                const topAfter = await rocketDepositPool.getQueueTop();
                assert.equal(topAfter[1], true);
                // Assign the validator from random user
                await rocketDepositPool.connect(random).assignMegapools(1);
                // Check the validator is now assigned
                const validatorInfoAfter = await megapool.getValidatorInfo(0);
                assert.equal(validatorInfoAfter.inQueue, false);
            });

            it(printTitle('node', 'cannot exit the deposit queue once assigned'), async () => {
                await deployMegapool({ from: node });
                await nodeDeposit(node);
                await shouldRevert(exitQueue(node, 0), 'Was able to exit the deposit queue once assigned', 'Validator must be in queue');
            });

            it(printTitle('node', 'can not create a new validator while debt is present'), async () => {
                await deployMegapool({ from: node });
                await megapool.connect(owner).setDebt('1'.ether);
                await shouldRevert(nodeDeposit(node), 'Created validator', 'Cannot create validator while debt exists');
            });

            it(printTitle('node', 'can create new validators per bond requirements'), async () => {
                await shouldRevert(nodeDeposit(node, '8'.ether), 'Created validator', 'Bond requirement not met');
                await shouldRevert(nodeDeposit(node, '2'.ether), 'Created validator', 'Bond requirement not met');
                await nodeDeposit(node);
                await shouldRevert(nodeDeposit(node, '2'.ether), 'Created validator', 'Bond requirement not met');
                await nodeDeposit(node);
                await shouldRevert(nodeDeposit(node, '2'.ether), 'Created validator', 'Bond requirement not met');
                await nodeDeposit(node);
                await shouldRevert(nodeDeposit(node,'2'.ether), 'Created validator', 'Bond requirement not met');
            });

            it(printTitle('node', 'can not consume more than 2 provisioned express tickets'), async () => {
                await nodeDeposit(node, '4'.ether, true);
                await nodeDeposit(node, '4'.ether, true);
                await shouldRevert(nodeDeposit(node, '4'.ether, true), 'Consumed express ticket', 'No express tickets');
            });

            it(printTitle('node', 'can create a new validator without an express ticket'), async () => {
                await nodeDeposit(node);
            });

            it(printTitle('node', 'can create a new validator with an express ticket'), async () => {
                await nodeDeposit(node, '4'.ether, true);
            });

            it(printTitle('random', 'can not dissolve validator before dissolve period ends'), async () => {
                await nodeDeposit(node);
                await shouldRevert(megapool.connect(random).dissolveValidator(0), 'Dissolved validator', 'Not enough time has passed to dissolve');
            });

            it(printTitle('random', 'can dissolve validator after dissolve period ends'), async () => {
                await nodeDeposit(node);
                await helpers.time.increase(dissolvePeriod + 1);
                await megapool.connect(random).dissolveValidator(0);
            });

            it(printTitle('node', 'can perform stake operation on pre-stake validator'), async () => {
                await nodeDeposit(node);
                await stakeMegapoolValidator(megapool, 0, { from: node });
            });

            describe('With pre-staked validator', () => {

                before(async () => {
                    await deployMegapool({ from: node });
                    await nodeDeposit(node);
                });

            });

            describe('With staking validator', () => {

                before(async () => {
                    await deployMegapool({ from: node });
                    await nodeDeposit(node);
                    await stakeMegapoolValidator(megapool, 0, { from: node });
                });

                it(printTitle('node', 'cannot perform stake operation on staking validator'), async () => {
                    await shouldRevert(stakeMegapoolValidator(megapool, 0, { from: node }), 'Was able to stake', 'Validator must be pre-staked');
                });

                it(printTitle('node', 'can distribute rewards'), async () => {
                    await owner.sendTransaction({
                        to: megapool.target,
                        value: '1'.ether,
                    });
                    const pendingRewards = await megapool.getPendingRewards();
                    assertBN.equal(pendingRewards, '1'.ether);

                    /*
                        Rewards: 1 ETH
                        Collat Ratio: 1/8
                        Node Portion: 0.125 ETH
                        User Portion: 0.875 ETH
                        Commission: 0.875 * 5% = 0.04375 ETH
                        Node Share: 0.04375 + 0.125 = 0.16875 ETH
                        Voter Share: 0.875 * 9% = 0.07875 ETH
                        rETH Share: 1 - 0.875 - 0.04375 = 0.08125 ETH

                        Note: calculations on-chain are of 3 fixed point precision
                     */
                    const rewardSplit = await megapool.calculatePendingRewards();
                    assertBN.equal(rewardSplit[0], '0.16875'.ether);
                    assertBN.equal(rewardSplit[1], '0.07875'.ether);
                    assertBN.equal(rewardSplit[2], '0.7525'.ether);

                    // Perform distribution
                    await distributeMegapool(megapool);
                });
            });
        });

        describe('With upgraded delegate', () => {
            let upgradeHelper;
            let oldDelegate, newDelegate;

            before(async () => {
                const rocketStorage = await RocketStorage.deployed();
                upgradeHelper = await MegapoolUpgradeHelper.deployed();
                oldDelegate = await RocketMegapoolDelegate.deployed();
                newDelegate = await RocketMegapoolDelegate.clone(rocketStorage.target);
            });

            it(printTitle('random', 'can not upgrade non-expired delegate'), async () => {
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Try to upgrade
                await shouldRevert(megapool.connect(random).delegateUpgrade(), 'Was able to upgrade delegate', 'Only the node operator can access this method');
            });

            it(printTitle('random', 'can upgrade expired delegate'), async () => {
                const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Fast-forward until delegate expires
                const oldDelegateExpiry = await rocketMegapoolFactory.getDelegateExpiry(oldDelegate.target);
                await helpers.mineUpTo(oldDelegateExpiry + 1n);
                // Try to upgrade
                await megapool.connect(random).delegateUpgrade();
            });

            it(printTitle('node', 'can upgrade non-expired delegate'), async () => {
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Try to upgrade
                await megapool.delegateUpgrade();
            });

            it(printTitle('node', 'can upgrade expired delegate'), async () => {
                const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Fast-forward until delegate expires
                const oldDelegateExpiry = await rocketMegapoolFactory.getDelegateExpiry(oldDelegate.target);
                await helpers.mineUpTo(oldDelegateExpiry + 1n);
                // Try to upgrade
                await megapool.delegateUpgrade();
            });

            it(printTitle('node', 'can not use expired delegate'), async () => {
                const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Fast-forward until delegate expires
                const oldDelegateExpiry = await rocketMegapoolFactory.getDelegateExpiry(oldDelegate.target);
                await helpers.mineUpTo(oldDelegateExpiry + 1n);
                // Try to call a function on the old delegate
                await shouldRevert(megapool.connect(node).getValidatorCount(), 'Used expired delegate', 'Delegate has expired');
            });

            it(printTitle('node', 'can use latest delegate'), async () => {
                const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
                // Enable useLatest
                await megapool.setUseLatestDelegate(true);
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Fast-forward until delegate expires
                const oldDelegateExpiry = await rocketMegapoolFactory.getDelegateExpiry(oldDelegate.target);
                await helpers.mineUpTo(oldDelegateExpiry + 1n);
                // Should be able to call a function without reverting
                await megapool.connect(node).getValidatorCount();
                // Effective delegate should be latest
                assert.equal(await megapool.getEffectiveDelegate(), newDelegate.target);
                // Disable use latest and check delegate remains the latest
                await megapool.setUseLatestDelegate(false);
                assert.equal(await megapool.getEffectiveDelegate(), newDelegate.target);
                assert.equal(await megapool.getDelegate(), newDelegate.target);
            });
        });
    });
}
