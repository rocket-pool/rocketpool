import { before, it, describe } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { nodeDepositEthFor, registerNode, setNodeTrusted, setNodeWithdrawalAddress } from '../_helpers/node';
import { snapshotDescribe, globalSnapShot } from '../_utils/snapshotting';
import { userDeposit } from '../_helpers/deposit';
import {
    calculatePositionInQueue, deployMegapool, getMegapoolForNode, getValidatorInfo, nodeDeposit,
} from '../_helpers/megapool';
import { shouldRevert } from '../_utils/testing';
import {
    BeaconStateVerifier, MegapoolUpgradeHelper, RocketDAOProtocolSettingsDeposit, RocketDAOProtocolSettingsMegapool,
    RocketDAOProtocolSettingsNode, RocketDepositPool, RocketMegapoolDelegate, RocketMegapoolFactory,
    RocketMegapoolManager, RocketNodeDeposit, RocketStorage,
} from '../_utils/artifacts';
import assert from 'assert';
import { stakeMegapoolValidator } from './scenario-stake';
import { assertBN } from '../_helpers/bn';
import { exitQueue } from './scenario-exit-queue';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { distributeMegapool } from './scenario-distribute';
import { withdrawCredit } from './scenario-withdraw-credit';
import { notifyExitValidator, notifyFinalBalanceValidator } from './scenario-exit';
import { applyPenalty } from './scenario-apply-penalty';
import { reduceBond } from './scenario-reduce-bond';
import { dissolveValidator } from './scenario-dissolve';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

const farFutureEpoch = 2n ** 64n - 1n;
const beaconGenesisTime = 1606824023;

export default function() {
    describe('Megapools', () => {
        let owner,
            node,
            node2,
            nodeWithdrawalAddress,
            random,
            trustedNode1,
            trustedNode2,
            trustedNode3;

        let megapool = null;

        const secondsPerSlot = 12;
        const slotsPerEpoch = 32;

        const userDistributeTime = (90 * 24 * 60 * 60); // 90 days

        async function mockRewards(megapool, amount = '1'.ether) {
            await owner.sendTransaction({
                to: megapool.target,
                value: amount,
            });
        }

        async function getCurrentEpoch() {
            const latestBlock = await ethers.provider.getBlock('latest');
            const currentTime = latestBlock.timestamp;

            const slotsPassed = Math.floor((currentTime - beaconGenesisTime) / secondsPerSlot);
            return Math.floor(slotsPassed / slotsPerEpoch);
        }

        async function waitEpochs(count) {
            const seconds = count * slotsPerEpoch * secondsPerSlot;
            await helpers.time.increase(seconds);
        }

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                node2,
                nodeWithdrawalAddress,
                random,
                trustedNode1,
                trustedNode2,
                trustedNode3,
            ] = await ethers.getSigners();

            // Register node & set withdrawal address
            await registerNode({ from: node });
            await setNodeWithdrawalAddress(node, nodeWithdrawalAddress, { from: node });
            await registerNode({ from: node2 });

            // Setup oDAO
            await registerNode({ from: trustedNode1 });
            await setNodeTrusted(trustedNode1, 'saas_1', 'node1@home.com', owner);
            await registerNode({ from: trustedNode2 });
            await setNodeTrusted(trustedNode2, 'saas_2', 'node2@home.com', owner);
            await registerNode({ from: trustedNode3 });
            await setNodeTrusted(trustedNode3, 'saas_3', 'node3@home.com', owner);

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

        it(printTitle('node', 'can exit the queue after a bond reduction and then use credit to deposit'), async () => {
            const rocketNodeDeposit = await RocketNodeDeposit.deployed();
            // Deposit enough for 3 validators
            await userDeposit({ from: random, value: ('32'.ether - '4'.ether) * 3n });
            await nodeDeposit(node, '4'.ether);
            await nodeDeposit(node, '4'.ether);
            await nodeDeposit(node, '4'.ether);
            await nodeDeposit(node, '4'.ether); // 4th validator enters the queue
            assertBN.equal(await megapool.getActiveValidatorCount(), 4n);
            assertBN.equal(await megapool.getNodeBond(), '4'.ether * 4n);
            // NO has 4 validators with a required 16 ETH bond 1 of those validators is in the queue
            // Reduce 'reduced.bond' to 2 ETH
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'reduced.bond', '2'.ether, { from: owner });
            // Exit the queue
            await exitQueue(node, 3);
            // NO had 16 ETH bond but new requirement for 3 validators is only 10, so they should receive 6 ETH credit
            assertBN.equal(await rocketNodeDeposit.getNodeDepositCredit(node.address), '6'.ether)
            // Perform 3 new deposits with credit at the reduced bond
            await nodeDeposit(node, '2'.ether, false, '2'.ether);
            await nodeDeposit(node, '2'.ether, false, '2'.ether);
            await nodeDeposit(node, '2'.ether, false, '2'.ether);
            // Used up all credit
            await shouldRevert(nodeDeposit(node, '2'.ether, false, '2'.ether), 'Exceeded credit', 'Insufficient credit');
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

        it(printTitle('node', 'can not exit queue twice'), async () => {
            await deployMegapool({ from: node });
            await nodeDeposit(node);
            await exitQueue(node, 0);
            await shouldRevert(exitQueue(node, 0), 'Exit queue twice', 'Validator must be in queue');
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

        //
        // Trusted nodes
        //

        it(printTitle('trusted node', 'can apply a penalty to a megapool'), async () => {
            await deployMegapool({ from: node });

            await applyPenalty(megapool, 0n, '1'.ether, trustedNode1);
            await applyPenalty(megapool, 0n, '1'.ether, trustedNode2);
            await shouldRevert(applyPenalty(megapool, 0n, '1'.ether, trustedNode3), 'Applied penalty past majority', 'Penalty already applied');
        });

        it(printTitle('trusted node', 'can not apply penalty greater than max'), async () => {
            const maxPenaltyAmount = '300'.ether;
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMegapool, 'maximum.megapool.eth.penalty', maxPenaltyAmount, { from: owner });

            await deployMegapool({ from: node });

            await applyPenalty(megapool, 0n, '301'.ether, trustedNode1);
            await shouldRevert(applyPenalty(megapool, 0n, '301'.ether, trustedNode2), 'Max penalty exceeded', 'Max penalty exceeded');
        });

        it(printTitle('trusted node', 'can apply another penalty only after 50400 blocks'), async () => {
            const maxPenaltyAmount = '300'.ether;
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMegapool, 'maximum.megapool.eth.penalty', maxPenaltyAmount, { from: owner });
            await deployMegapool({ from: node });
            await applyPenalty(megapool, 0n, '300'.ether, trustedNode1);
            await applyPenalty(megapool, 0n, '300'.ether, trustedNode2);
            const megapoolDebtBefore = await megapool.getDebt();
            await helpers.mine(50397);
            await applyPenalty(megapool, 1n, '300'.ether, trustedNode1);
            await shouldRevert(applyPenalty(megapool, 1n, '300'.ether, trustedNode2), 'Applied greater penalty', 'Max penalty exceeded');
            await helpers.mine(3);
            await applyPenalty(megapool, 1n, '300'.ether, trustedNode2);
            const megapoolDebtAfter = await megapool.getDebt();
            const debtDelta = megapoolDebtAfter - megapoolDebtBefore;
            assertBN.equal(debtDelta, '300'.ether);
        });

        it(printTitle('misc', 'should calculate rewards on an empty megapool'), async () => {
            await deployMegapool({ from: node });
            {
                const rewards = await megapool.calculatePendingRewards();
                assertBN.equal(rewards[0], 0n);
                assertBN.equal(rewards[1], 0n);
                assertBN.equal(rewards[2], 0n);
            }
            await mockRewards(megapool, '1'.ether);
            {
                const rewards = await megapool.calculatePendingRewards();
                assertBN.equal(rewards[0], '1'.ether);
                assertBN.equal(rewards[1], 0n);
                assertBN.equal(rewards[2], 0n);
            }
        });

        snapshotDescribe('With overbonded megapool', () => {
            before(async () => {
                // Deposit enough for 4 validators
                await userDeposit({ from: random, value: ('32'.ether - '4'.ether) * 4n });
                await nodeDeposit(node, '4'.ether);
                await nodeDeposit(node, '4'.ether);
                await nodeDeposit(node, '4'.ether);
                // Reduce 'reduced.bond' to 2 ETH
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'reduced.bond', '2'.ether, { from: owner });
                // Node is now overbonded by 2 ETH
            });

            it(printTitle('node', 'can not reduce bond below requirement'), async () => {
                await shouldRevert(reduceBond(megapool, '3'.ether), 'Reduced bond below requirement', 'New bond is too low');
            });

            it(printTitle('node', 'can partially reduce bond'), async () => {
                await reduceBond(megapool, '1'.ether);
            });

            it(printTitle('node', 'can not reduce bond while at minimum'), async () => {
                await reduceBond(megapool, '2'.ether);
                await shouldRevert(reduceBond(megapool, '1'.ether), 'Reduced bond below requirement', 'Bond is at minimum');
            });

            it(printTitle('node', 'can not reduce bond with debt'), async () => {
                await applyPenalty(megapool, 0n, '1'.ether, trustedNode1);
                await applyPenalty(megapool, 0n, '1'.ether, trustedNode2);
                await shouldRevert(reduceBond(megapool, '2'.ether), 'Reduced bond with debt', 'Cannot reduce bond with debt');
            });

            it(printTitle('node', 'can reduce bond to new requirement and use credit for another validator'), async () => {
                await reduceBond(megapool, '2'.ether);
                await nodeDeposit(node, '2'.ether, false, '2'.ether);
            });

            it(printTitle('node', 'can reduce bond to new requirement and use credit to mint rETH'), async () => {
                await reduceBond(megapool, '2'.ether);
                await withdrawCredit(node, '2'.ether);
            });

            it(printTitle('node', 'can reduce bond to new requirement and use some credit for another validator and some for rETH'), async () => {
                await reduceBond(megapool, '2'.ether);
                await withdrawCredit(node, '1'.ether);
                await nodeDeposit(node, '2'.ether, false, '1'.ether);
            });
        });

        snapshotDescribe('With full deposit pool', () => {
            const dissolvePeriod = (60 * 60 * 24 * 10); // 10 Days

            before(async () => {
                // Deposit ETH into deposit pool
                await userDeposit({ from: random, value: '32'.ether * 10n });
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
                await rocketDepositPool.connect(random).assignDeposits(1);
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
                await applyPenalty(megapool, 0n, '1'.ether, trustedNode1);
                await applyPenalty(megapool, 0n, '1'.ether, trustedNode2);
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
                await shouldRevert(nodeDeposit(node, '2'.ether), 'Created validator', 'Bond requirement not met');
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
                await shouldRevert(megapool.connect(random).dissolveValidator(0), 'Dissolved validator', 'Not enough time has passed');
            });

            it(printTitle('random', 'can dissolve validator after dissolve period ends'), async () => {
                await nodeDeposit(node);
                await helpers.time.increase(dissolvePeriod + 1);
                await dissolveValidator(node, 0, random);
            });

            it(printTitle('random', 'can dissolve validator immediately with a state proof'), async () => {
                await nodeDeposit(node);
                const info = await getValidatorInfo(megapool, 0);
                const incorrectCredentials = {
                    slot: 0n,
                    validatorIndex: 0n,
                    validator: {
                        pubkey: info.pubkey,
                        withdrawalCredentials: '0x0100000000000000000000000000000000000000000000000000000000000000',
                        effectiveBalance: 0n,
                        slashed: false,
                        activationEligibilityEpoch: 0n,
                        activationEpoch: 0n,
                        exitEpoch: 0n,
                        withdrawableEpoch: 0n,
                    },
                    witnesses: [],
                };
                await dissolveValidator(node, 0, random, incorrectCredentials);
            });

            it(printTitle('random', 'can not dissolve validator immediately with correct credentials'), async () => {
                await nodeDeposit(node);
                const info = await getValidatorInfo(megapool, 0);
                const withdrawalCredentials = await megapool.getWithdrawalCredentials();
                const correctCredentials = {
                    slot: 0n,
                    validatorIndex: 0n,
                    validator: {
                        pubkey: info.pubkey,
                        withdrawalCredentials: withdrawalCredentials,
                        effectiveBalance: 0n,
                        slashed: false,
                        activationEligibilityEpoch: 0n,
                        activationEpoch: 0n,
                        exitEpoch: 0n,
                        withdrawableEpoch: 0n,
                    },
                    witnesses: [],
                };
                await shouldRevert(
                    dissolveValidator(node, 0, random, correctCredentials),
                    'Was able to dissolve validator',
                    'Valid withdrawal credentials'
                )
            });

            it(printTitle('random', 'can not dissolve a validator immediately with non-matching pubkey'), async () => {
                await nodeDeposit(node);
                const incorrectPubkey = {
                    slot: 0n,
                    validatorIndex: 0n,
                    validator: {
                        pubkey: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
                        withdrawalCredentials: '0x0100000000000000000000000000000000000000000000000000000000000000',
                        effectiveBalance: 0n,
                        slashed: false,
                        activationEligibilityEpoch: 0n,
                        activationEpoch: 0n,
                        exitEpoch: 0n,
                        withdrawableEpoch: 0n,
                    },
                    witnesses: [],
                };
                await shouldRevert(
                    dissolveValidator(node, 0, random, incorrectPubkey),
                    'Was able to dissolve validator',
                    'Pubkey does not match'
                );
            });

            it(printTitle('node', 'can perform stake operation on pre-stake validator'), async () => {
                await nodeDeposit(node);
                await stakeMegapoolValidator(megapool, 0);
            });

            it(printTitle('random', 'can perform stake operation on pre-stake validator'), async () => {
                await nodeDeposit(node);
                const megapoolRandom = megapool.connect(random)
                await stakeMegapoolValidator(megapoolRandom, 0);
            });

            it(printTitle('node', 'can not stake with invalid withdrawal credentials'), async () => {
                const rocketMegapoolManager = await RocketMegapoolManager.deployed();
                await nodeDeposit(node);
                const validatorInfo = await getValidatorInfo(megapool, 0);
                const withdrawalCredentials = Buffer.from('0100000000000000000000000000000000000000000000000000000000000000', 'hex');
                // Construct a fake proof
                const proof = {
                    slot: 0n,
                    validatorIndex: 0n,
                    validator: {
                        pubkey: validatorInfo.pubkey,
                        withdrawalCredentials: withdrawalCredentials,
                        effectiveBalance: 0n,
                        slashed: false,
                        activationEligibilityEpoch: 0n,
                        activationEpoch: 0n,
                        exitEpoch: 0n,
                        withdrawableEpoch: 0n,
                    },
                    witnesses: []
                }
                await shouldRevert(rocketMegapoolManager.stake(megapool.target, 0n, proof), 'Staked with invalid credentials', 'Invalid withdrawal credentials');
            });

            it(printTitle('node', 'can perform a second stake operation with no rewards available'), async () => {
                await nodeDeposit(node);
                await nodeDeposit(node);
                await stakeMegapoolValidator(megapool, 0);
                await stakeMegapoolValidator(megapool, 1);
            });

            snapshotDescribe('With staking validator', () => {
                before(async () => {
                    await deployMegapool({ from: node });
                    await nodeDeposit(node);
                    await stakeMegapoolValidator(megapool, 0);
                });

                it(printTitle('node', 'cannot perform stake operation on staking validator'), async () => {
                    await shouldRevert(stakeMegapoolValidator(megapool, 0), 'Was able to stake', 'Validator must be pre-staked');
                });

                it(printTitle('node', 'can distribute rewards'), async () => {
                    await mockRewards(megapool, '1'.ether);
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

                it(printTitle('node', 'can distribute until withdrawable epoch is reached'), async () => {
                    // Notify exit in 5 epochs
                    const currentEpoch = await getCurrentEpoch();
                    await notifyExitValidator(megapool, 0, currentEpoch + 5);
                    // Can distribute
                    await mockRewards(megapool, '1'.ether);
                    await distributeMegapool(megapool);
                    // Pass 5 epochs
                    await waitEpochs(5);
                    // Can't distribute
                    await mockRewards(megapool, '1'.ether);
                    await shouldRevert(distributeMegapool(megapool), 'Was able to distribute', 'Pending validator exit');
                });

                it(printTitle('node', 'can not notify exit when withdrawable_epoch = FAR_FUTURE_EPOCH'), async () => {
                    await shouldRevert(notifyExitValidator(megapool, 0, farFutureEpoch), 'Notified non-exiting validator', 'Validator is not exiting');
                });

                it(printTitle('node', 'can not notify exit twice'), async () => {
                    const currentEpoch = await getCurrentEpoch();
                    await notifyExitValidator(megapool, 0, currentEpoch + 5);
                    await shouldRevert(notifyExitValidator(megapool, 0, currentEpoch + 5), 'Notified exit twice', 'Already notified');
                });

                it(printTitle('node', 'can not notify final balance twice'), async () => {
                    const withdrawalEpoch = await getCurrentEpoch();
                    await notifyExitValidator(megapool, 0, withdrawalEpoch);
                    await notifyFinalBalanceValidator(megapool, 0, '32'.ether, owner, withdrawalEpoch * 32);
                    await shouldRevert(notifyFinalBalanceValidator(megapool, 0, '32'.ether, owner, withdrawalEpoch * 32), 'Notified final balance twice', 'Already exited');
                });

                it(printTitle('node', 'can not notify final balance from before withdrawal epoch'), async () => {
                    const withdrawalEpoch = await getCurrentEpoch();
                    await notifyExitValidator(megapool, 0, withdrawalEpoch);
                    await shouldRevert(
                        notifyFinalBalanceValidator(megapool, 0, '32'.ether, owner, withdrawalEpoch * 32 - 1),
                        'Was able to notify final balance prior to withdrawal',
                        'Not full withdrawal'
                    );
                });

                it(printTitle('node', 'can not notify exit on exited validator'), async () => {
                    const currentEpoch = await getCurrentEpoch();
                    await notifyExitValidator(megapool, 0, await getCurrentEpoch());
                    await notifyFinalBalanceValidator(megapool, 0, '32'.ether, owner, currentEpoch * 32);
                    await shouldRevert(notifyExitValidator(megapool, 0, currentEpoch + 5), 'Notified exit twice', 'Already exited');
                });

            });

            snapshotDescribe('With multiple staking validators', () => {

                before(async () => {
                    await deployMegapool({ from: node });
                    for (let i = 0; i < 5; i++) {
                        await nodeDeposit(node);
                        await stakeMegapoolValidator(megapool, i);
                    }
                });

                it(printTitle('node', 'can distribute capital after full exit'), async () => {
                    // Notify exit and final balance
                    const currentEpoch = await getCurrentEpoch();
                    await notifyExitValidator(megapool, 0, currentEpoch);
                    await notifyFinalBalanceValidator(megapool, 0, '32'.ether, owner, currentEpoch * 32);
                    // Can distribute
                    await mockRewards(megapool, '1'.ether);
                    await distributeMegapool(megapool);
                });

                it(printTitle('random', 'can permissionlessly notify final balance and distribute a validator after user distribute window'), async () => {
                    // Notify exit and final balance
                    const currentEpoch = await getCurrentEpoch();
                    const megapoolWithRandom = megapool.connect(random);
                    await notifyExitValidator(megapoolWithRandom, 0, currentEpoch);
                    await shouldRevert(notifyFinalBalanceValidator(megapoolWithRandom, 0, '32'.ether, owner, currentEpoch * 32), 'Was able to distribute', 'Not enough time has passed');
                    // Wait the window
                    await helpers.time.increase(userDistributeTime + slotsPerEpoch * secondsPerSlot + 1);
                    // Should work now
                    await notifyFinalBalanceValidator(megapoolWithRandom, 0, '32'.ether, owner, currentEpoch * 32);
                    // Can distribute
                    await mockRewards(megapoolWithRandom, '1'.ether);
                    await distributeMegapool(megapoolWithRandom);
                });

                it(printTitle('node', 'can bond reduce on exit'), async () => {
                    // Adjust `reduced_bond` to 2 ETH
                    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'reduced.bond', '2'.ether, { from: owner });
                    // Notify exit in 5 epochs
                    const currentEpoch = await getCurrentEpoch();
                    await notifyExitValidator(megapool, 0, currentEpoch);
                    const nodeBalanceBefore = await ethers.provider.getBalance(nodeWithdrawalAddress);
                    await notifyFinalBalanceValidator(megapool, 0, '32'.ether, owner, currentEpoch * 32);
                    const nodeBalanceAfter = await ethers.provider.getBalance(nodeWithdrawalAddress);
                    /*
                        NO started with 5 validators
                        old bond requirement = 8 + (4 * 3) = 20
                        new bond requirement = 8 + (2 * 2) = 12
                        therefore, NOs bond after exit should be 12, with an 8 ETH refund from the 32 ETH final balance
                     */
                    const nodeBond = await megapool.getNodeBond();
                    assertBN.equal(nodeBond, '12'.ether);
                    assertBN.equal(nodeBalanceAfter - nodeBalanceBefore, '8'.ether);
                });

                it(printTitle('node', 'can bond reduce on exit with balance < 32 ETH'), async () => {
                    // Adjust `reduced_bond` to 2 ETH
                    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'reduced.bond', '2'.ether, { from: owner });
                    // Notify exit in 5 epochs
                    const currentEpoch = await getCurrentEpoch();
                    await notifyExitValidator(megapool, 0, currentEpoch);
                    const nodeBalanceBefore = await ethers.provider.getBalance(nodeWithdrawalAddress);
                    await notifyFinalBalanceValidator(megapool, 0, '32'.ether - '7'.ether, owner, currentEpoch * 32);
                    const nodeBalanceAfter = await ethers.provider.getBalance(nodeWithdrawalAddress);
                    /*
                        NO should receive 8 ETH bond on exit, but lost 7 ETH capital so bond should reduce by 8 ETH
                        but NO should only receive 1 ETH refund
                     */
                    const nodeBond = await megapool.getNodeBond();
                    assertBN.equal(nodeBond, '12'.ether);
                    assertBN.equal(nodeBalanceAfter - nodeBalanceBefore, '1'.ether);
                });

                it(printTitle('node', 'accrues debt when exit balance is too low and bond has been reduced'), async () => {
                    // Adjust `reduced_bond` to 2 ETH
                    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'reduced.bond', '2'.ether, { from: owner });
                    // Notify exit in 5 epochs
                    const currentEpoch = await getCurrentEpoch();
                    await notifyExitValidator(megapool, 0, currentEpoch);
                    await notifyFinalBalanceValidator(megapool, 0, '32'.ether - '9'.ether, owner, currentEpoch * 32);
                    /*
                        NO should receive 8 ETH bond on exit, but lost 9 ETH capital so bond should reduce by 8 ETH
                        but NO should accrue a 1 ETH debt
                     */
                    const nodeBond = await megapool.getNodeBond();
                    const nodeRefund = await megapool.getRefundValue();
                    const nodeDebt = await megapool.getDebt();
                    assertBN.equal(nodeBond, '12'.ether);
                    assertBN.equal(nodeRefund, '0'.ether);
                    assertBN.equal(nodeDebt, '1'.ether);
                });

                snapshotDescribe('With debt', () => {
                    before(async () => {
                        /*
                            Exit the validator with 5 ETH capital loss will result in a debt of 1 ETH
                         */
                        const currentEpoch = await getCurrentEpoch();
                        await notifyExitValidator(megapool, 0, currentEpoch);
                        await notifyFinalBalanceValidator(megapool, 0, '32'.ether - '5'.ether, owner, currentEpoch * 32);
                        const nodeDebt = await megapool.getDebt();
                        assertBN.equal(nodeDebt, '1'.ether);
                    });

                    it(printTitle('node', 'can manually pay down debt'), async () => {
                        const debtBefore = await megapool.getDebt();
                        assertBN.isAbove(debtBefore, 0n);
                        await megapool.repayDebt({value: debtBefore});
                        const debtAfter = await megapool.getDebt();
                        assertBN.equal(debtAfter, '0'.ether);
                    });

                    it(printTitle('node', 'can use rewards to partially pay down debt'), async () => {
                        await mockRewards(megapool, '1'.ether);
                        await distributeMegapool(megapool);
                    });

                    it(printTitle('node', 'can use rewards to fully pay down debt'), async () => {
                        await mockRewards(megapool, '20'.ether);
                        await distributeMegapool(megapool);
                    });
                });
            });
        });

        snapshotDescribe('With upgraded delegate', () => {
            let upgradeHelper;
            let oldDelegate, newDelegate;

            before(async () => {
                await deployMegapool({ from: node });

                const rocketStorage = await RocketStorage.deployed();
                upgradeHelper = await MegapoolUpgradeHelper.deployed();
                oldDelegate = await RocketMegapoolDelegate.deployed();
                newDelegate = await RocketMegapoolDelegate.clone(rocketStorage.target, beaconGenesisTime);
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
