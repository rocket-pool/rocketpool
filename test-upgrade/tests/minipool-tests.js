import { executeUpgrade } from '../_helpers/upgrade';
import assert from 'assert';
import {
    artifacts,
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsMinipool,
    RocketDepositPool,
    RocketMinipoolDelegate,
    RocketMinipoolFactory,
    RocketMinipoolPenalty,
    RocketNetworkPenalties,
    RocketNodeDeposit,
    RocketNodeManager,
} from '../../test/_utils/artifacts';
import { shouldRevert } from '../../test/_utils/testing';
import { createVacantMinipool, minipoolStates, promoteMinipool, stakeMinipool } from '../../test/_helpers/minipool';
import { getNodeDepositCredit, nodeStakeRPL, setNodeTrusted } from '../../test/_helpers/node';
import { submitPenalty } from '../../test/network/scenario-submit-penalties';
import { setDAONodeTrustedBootstrapSetting } from '../../test/dao/scenario-dao-node-trusted-bootstrap';
import { getValidatorPubkey } from '../../test/_utils/beacon';
import { deployMegapool } from '../../test/_helpers/megapool';
import { beginUserDistribute, withdrawValidatorBalance } from '../../test/minipool/scenario-withdraw-validator-balance';
import { setDAOProtocolBootstrapSetting } from '../../test/dao/scenario-dao-protocol-bootstrap';
const { assertBN } = require('../../test/_helpers/bn');
const { beforeEach, describe, before, it } = require('mocha');
const { globalSnapShot } = require('../../test/_utils/snapshotting');
const { deployUpgrade } = require('../_helpers/upgrade');
const { setDefaultParameters } = require('../../test/_helpers/defaults');
const { printTitle } = require('../../test/_utils/formatting');
const { registerNode } = require('../../test/_helpers/node');
const { userDeposit } = require('../../test/_helpers/deposit');
const { nodeDeposit, getMegapoolForNode, getValidatorInfo } = require('../../test/_helpers/megapool');
const { getMinipoolMinimumRPLStake } = require('../../test/_helpers/minipool');
const { mintRPL } = require('../../test/_helpers/tokens');
const { stakeRPL } = require('../_helpers/stake');
const { createMinipool } = require('../_helpers/minipool');

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

const rocketStorageAddress = process.env.ROCKET_STORAGE || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

export default function() {
    describe('Minipool Tests', () => {
        let owner,
            node,
            nodeWithdrawalAddress,
            trustedNode1,
            trustedNode2,
            trustedNode3,
            random;

        let upgradeContract;
        let userDistributeStartTime = (60 * 60 * 24 * 90);

        async function withdrawAndCheck(minipool, withdrawalBalance, from, finalise, expectedUser, expectedNode, userDistribute = false) {
            const withdrawalBalanceBN = withdrawalBalance.ether;
            const expectedUserBN = expectedUser.ether;
            const expectedNodeBN = expectedNode.ether;

            let result;

            if (userDistribute) {
                // Send ETH to minipool
                await from.sendTransaction({
                    to: minipool.target,
                    value: withdrawalBalanceBN,
                });
                // Begin user distribution process
                await beginUserDistribute(minipool, { from });
                // Wait 90 days
                await helpers.time.increase(userDistributeStartTime + 1);
                // Process withdrawal
                result = await withdrawValidatorBalance(minipool, '0'.ether, from, finalise);
            } else {
                // Process withdrawal
                result = await withdrawValidatorBalance(minipool, withdrawalBalanceBN, from, finalise);
            }

            // Check results
            assertBN.equal(result.rethBalanceChange + result.depositPoolChange, expectedUserBN, 'User balance was incorrect');
            assertBN.equal(result.nodeBalanceChange, expectedNodeBN, 'Node balance was incorrect');
        }

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                nodeWithdrawalAddress,
                trustedNode1,
                trustedNode2,
                trustedNode3,
                random,
            ] = await ethers.getSigners();

            // Deploy upgrade while global artifacts are still latest version
            upgradeContract = await deployUpgrade(rocketStorageAddress);
            // Load artifacts from old deployment and initialise default parameters
            await artifacts.loadFromDeployment(rocketStorageAddress);
            await setDefaultParameters();

            // Set user distribute start time
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.user.distribute.window.start', userDistributeStartTime, { from: owner });
        });

        beforeEach(async () => {
            await artifacts.loadFromDeployment(rocketStorageAddress);
        });

        it(printTitle('node', 'can assign a minipool after upgrade'), async () => {
            // Register node and create a 16 ETH minipool
            await registerNode({ from: node });
            const minipoolRplStake = await getMinipoolMinimumRPLStake();
            await mintRPL(owner, node, minipoolRplStake);
            await stakeRPL(node, minipoolRplStake);
            const minipool = await createMinipool({ from: node, value: '16'.ether });
            assertBN.equal(await minipool.getStatus(), 0n); // Initialised
            // Execute upgrade
            await executeUpgrade(owner, upgradeContract, rocketStorageAddress);
            // Queue up a megapool validator
            await nodeDeposit(node);
            // Perform a user deposit that will assign 1 validator (the minipool)
            await userDeposit({ from: random, value: '32'.ether });
            // Check minipool was assigned
            assertBN.equal(await minipool.getStatus(), 1n); // Prestake status
            // Perform a user deposit that will assign 1 validator (the megapool)
            await userDeposit({ from: random, value: '32'.ether });
            // Check megapool validator status
            const megapool = await getMegapoolForNode(node);
            const validatorInfoAfter = await getValidatorInfo(megapool, 0);
            assert.equal(validatorInfoAfter.staked, false);
            assert.equal(validatorInfoAfter.inPrestake, true);
            assert.equal(validatorInfoAfter.inQueue, false);
        });

        it(printTitle('node', 'can use credit from a solo migration after upgrade'), async() => {
            // Set promotion delay
            let promotionScrubDelay = (60 * 60 * 24); // 24 hours
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.promotion.scrub.period', promotionScrubDelay, { from: owner });
            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake * 7n;
            await registerNode({ from: node });
            await mintRPL(owner, node, rplStake);
            await stakeRPL(node, rplStake);
            // Create vacant minipool
            const rocketNodeDeposit = await RocketNodeDeposit.deployed();
            const rocketMinipoolFactory = await RocketMinipoolFactory.deployed();
            const pubkey = getValidatorPubkey();
            const minipoolAddress = (await rocketMinipoolFactory.getExpectedAddress(node.address, 0n)).substr(2);
            await rocketNodeDeposit.connect(node).createVacantMinipool('8'.ether, '0'.ether, pubkey, 0n, '0x' + minipoolAddress, '32'.ether);
            // Execute upgrade
            await executeUpgrade(owner, upgradeContract, rocketStorageAddress);
            // Wait required scrub period
            await helpers.time.increase(promotionScrubDelay + 1);
            // Promote the minipool
            const prelaunchMinipool8 = await RocketMinipoolDelegate.at('0x' + minipoolAddress);
            await promoteMinipool(prelaunchMinipool8, { from: node });
            // Verify deposit credit balance increases by 24 ETH with migration
            const rocketDepositPool = await RocketDepositPool.deployed();
            assertBN.equal(await getNodeDepositCredit(node), '24'.ether);
            // Deposit 24 ETH into deposit pool to make it available for use
            await userDeposit({ from: random, value: '24'.ether });
            // Create 6 megapool validators with credit
            await deployMegapool({ from: node });
            for (let i = 0; i < 6; ++i) {
                await nodeDeposit(node, '4'.ether, false, '4'.ether);
                // There is only 24 ETH in DP, not enough to assign
                assertBN.equal(await rocketDepositPool.getBalance(), '24'.ether)
                assertBN.equal(await rocketDepositPool.getNodeBalance(), '4'.ether * BigInt(i + 1))
            }
            // Deposit enough ETH into deposit pool to assign the 3 validators (use >=32 ETH to trigger assignment)
            for (let i = 0; i < 3; ++i) {
                await userDeposit({ from: random, value: '32'.ether });
            }
            /**
             * Initial DP balance was 24 ETH (24 node ETH and 0 user ETH)
             *
             * After 6x node deposits with credit and 3x 32 ETH user deposits there should
             * now be 12 user ETH left and 12 node ETH
             */
            {
                const balance = await rocketDepositPool.getBalance();
                const userBalance = await rocketDepositPool.getUserBalance();
                const nodeBalance = await rocketDepositPool.getNodeBalance();
                assertBN.equal(balance, '24'.ether);
                assertBN.equal(userBalance, '12'.ether);
                assertBN.equal(nodeBalance, '12'.ether);
            }
            // Deposit enough ETH into deposit pool to assign the remaining 3 validators (use >=32 ETH to trigger assignment)
            for (let i = 0; i < 3; ++i) {
                await userDeposit({ from: random, value: '32'.ether });
            }
            /**
             * After 3 more user deposits of 32 ETH user deposits there should
             * now be 24 user ETH left and 0 node ETH
             */
            {
                const balance = await rocketDepositPool.getBalance();
                const userBalance = await rocketDepositPool.getUserBalance();
                const nodeBalance = await rocketDepositPool.getNodeBalance();
                assertBN.equal(balance, '24'.ether);
                assertBN.equal(userBalance, '24'.ether);
                assertBN.equal(nodeBalance, '0'.ether);
            }
        })

        describe('With staking legacy minipool', () => {
            let minipool

            beforeEach(async () => {
                // Register node and create a 16 ETH minipool
                await registerNode({ from: node });
                const minipoolRplStake = await getMinipoolMinimumRPLStake();
                await mintRPL(owner, node, minipoolRplStake);
                await stakeRPL(node, minipoolRplStake);
                minipool = (await createMinipool({ from: node, value: '16'.ether })).connect(node);
                assertBN.equal(await minipool.getStatus(), 0n); // Initialised
                // Execute upgrade
                await executeUpgrade(owner, upgradeContract, rocketStorageAddress);
                // Perform a user deposit that will assign 1 validator (the minipool)
                await userDeposit({ from: random, value: '32'.ether });
                // Wait for scrub period
                await helpers.time.increase(60 * 60 * 12 + 1)
                // Stake
                await stakeMinipool(minipool, {from: node})
                // Register trusted nodes
                await registerNode({ from: trustedNode1 });
                await registerNode({ from: trustedNode2 });
                await registerNode({ from: trustedNode3 });
                await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);
                await setNodeTrusted(trustedNode2, 'saas_2', 'node@home.com', owner);
                await setNodeTrusted(trustedNode3, 'saas_3', 'node@home.com', owner);
                // Set max penalty rate
                let rocketMinipoolPenalty = await RocketMinipoolPenalty.deployed();
                rocketMinipoolPenalty.setMaxPenaltyRate('1'.ether, { from: owner });
            })

            it(printTitle('node', 'can not bond reduce after upgrade'), async () => {
                // Attempt a bond reduction
                await shouldRevert(
                    minipool.reduceBondAmount(),
                    'Was able to reduce bond after upgrade',
                    'Minipool bond reductions are no longer available'
                );
            });

            it(printTitle('node', 'has expected number of express queue tickets'), async () => {
                const rocketNodeManager = await RocketNodeManager.deployed();
                const expressTicketsBefore = await rocketNodeManager.getExpressTicketCount(node.address)
                // 2 base + 4 for the 16 ETH minipool (16 / 4)
                assertBN.equal(expressTicketsBefore, 6n);
                assert.equal(await rocketNodeManager.getExpressTicketsProvisioned(node.address), false);
                // Manually provision
                await rocketNodeManager.connect(node).provisionExpressTickets(node.address);
                const expressTicketsAfter = await rocketNodeManager.getExpressTicketCount(node.address)
                assertBN.equal(expressTicketsAfter, 6n);
                assert.equal(await rocketNodeManager.getExpressTicketsProvisioned(node.address), true);
            });

            it(printTitle('node', 'can exit a staking minipool'), async () => {
                await withdrawAndCheck(minipool, '36', node, false, '17.8', '18.2');
            });

            it(printTitle('trusted node', 'can submit minipool penalties'), async() => {
                let minipoolAddress = minipool.target;
                const rocketNetworkPenalties = await RocketNetworkPenalties.deployed()

                // Apply some penalties
                for (let block = 1; block < 5; block++) {
                    await submitPenalty(minipoolAddress, block, {
                        from: trustedNode1,
                    });
                    await submitPenalty(minipoolAddress, block, {
                        from: trustedNode2,
                    });
                    await submitPenalty(minipoolAddress, block, {
                        from: trustedNode3,
                    });

                    const currentRunning = await rocketNetworkPenalties.getCurrentPenaltyRunningTotal()
                    assertBN.equal(currentRunning, block)
                }

                const penaltyCount = await rocketNetworkPenalties.getPenaltyCount(minipoolAddress);
                assertBN.equal(penaltyCount, 4n);
                const currentMaxPenalty = await rocketNetworkPenalties.getCurrentMaxPenalty()
                assertBN.equal(currentMaxPenalty, 2500n - 4n);
            })

            it(printTitle('node', 'can not submit minipool penalties'), async() => {
                let minipoolAddress = minipool.target;
                let block = 10;
                await shouldRevert(submitPenalty(minipoolAddress, block, {
                    from: node,
                }), 'Was able to submit penalty', 'Invalid trusted node');
            })

        })
    });
}
