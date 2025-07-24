import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { submitPrices } from '../_helpers/network';
import {
    nodeStakeRPL,
    registerNode,
    setNodeRPLWithdrawalAddress,
    setNodeTrusted,
    setNodeWithdrawalAddress,
} from '../_helpers/node';
import {
    RevertOnTransfer,
    RocketDAONodeTrustedProposals,
    RocketDAOProtocolSettingsNode,
    RocketMerkleDistributorMainnet,
    RocketRewardsPool,
    RocketSmoothingPool,
    RocketStorage,
} from '../_utils/artifacts';
import {
    setDAONetworkBootstrapRewardsClaimers,
    setDAOProtocolBootstrapSetting,
    setRewardsClaimIntervalTime,
    setRPLInflationIntervalRate,
    setRPLInflationStartTime,
} from '../dao/scenario-dao-protocol-bootstrap';
import { mintRPL } from '../_helpers/tokens';
import { executeRewards, submitRewards } from './scenario-submit-rewards';
import { claimRewards } from './scenario-claim-rewards';
import { claimAndStakeRewards } from './scenario-claim-and-stake-rewards';
import { parseRewardsMap } from '../_utils/merkle-tree';
import { daoNodeTrustedExecute, daoNodeTrustedPropose, daoNodeTrustedVote } from '../dao/scenario-dao-node-trusted';
import { getDAOProposalStartTime } from '../dao/scenario-dao-proposal';
import { assertBN } from '../_helpers/bn';
import { globalSnapShot } from '../_utils/snapshotting';
import * as assert from 'node:assert';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketRewardsPool', () => {
        let owner,
            userOne,
            registeredNode1,
            registeredNode2,
            registeredNodeTrusted1,
            registeredNodeTrusted2,
            unregisteredNodeTrusted1,
            unregisteredNodeTrusted2,
            node1WithdrawalAddress,
            random;

        // Constants
        const ONE_DAY = 24 * 60 * 60;
        const claimIntervalTime = BigInt(ONE_DAY * 28);
        const scrubPeriod = ONE_DAY;

        // Set some RPL inflation scenes
        let rplInflationSetup = async function() {
            // Current time
            let currentTime = await helpers.time.latest();
            // Starting block for when inflation will begin
            let timeStart = currentTime + ONE_DAY;
            // Yearly inflation target
            let yearlyInflationTarget = 0.05;

            // Set the daily inflation start time
            await setRPLInflationStartTime(timeStart, { from: owner });
            // Set the daily inflation rate
            await setRPLInflationIntervalRate(yearlyInflationTarget, { from: owner });

            // claimIntervalTime must be greater than rewardIntervalTime for tests to properly function
            assertBN.isAbove(claimIntervalTime, ONE_DAY, 'Tests will not function correctly unless claimIntervalTime is greater than inflation period (1 day)');

            // Return the starting time for inflation when it will be available
            return BigInt(timeStart + ONE_DAY);
        };

        // Set a rewards claiming contract
        let rewardsContractSetup = async function(_trustedNodePerc, _protocolPerc, _nodePerc, _claimAmountPerc) {
            // Set the amount this contract can claim
            await setDAONetworkBootstrapRewardsClaimers(_trustedNodePerc, _protocolPerc, _nodePerc, { from: owner });
            // Set the claim interval blocks
            await setRewardsClaimIntervalTime(claimIntervalTime, { from: owner });
        };

        async function kickTrustedNode(nodeAddress, voters) {
            let rocketDAONodeTrustedProposals = await RocketDAONodeTrustedProposals.deployed();
            let proposalCalldata = rocketDAONodeTrustedProposals.interface.encodeFunctionData('proposalKick', [nodeAddress.address, 0n]);
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose(`Kick ${nodeAddress.address}`, proposalCalldata, {
                from: registeredNodeTrusted1,
            });
            // Current time
            let timeCurrent = await helpers.time.latest();
            // Now increase time until the proposal is 'active' and can be voted on
            await helpers.time.increase((await getDAOProposalStartTime(proposalID) - timeCurrent) + 2);
            // Now lets vote
            for (const voter of voters) {
                await daoNodeTrustedVote(proposalID, true, { from: voter });
            }
            // Proposal has passed, lets execute it now
            await daoNodeTrustedExecute(proposalID, { from: registeredNode1 });
        }

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
                userOne,
                registeredNode1,
                registeredNode2,
                registeredNodeTrusted1,
                registeredNodeTrusted2,
                unregisteredNodeTrusted1,
                unregisteredNodeTrusted2,
                node1WithdrawalAddress,
                random,
            ] = await ethers.getSigners();

            let slotTimestamp = '1600000000';

            // Register nodes
            await registerNode({ from: registeredNode1 });
            await registerNode({ from: registeredNode2 });
            await registerNode({ from: registeredNodeTrusted1 });
            await registerNode({ from: registeredNodeTrusted2 });
            await registerNode({ from: unregisteredNodeTrusted1 });
            await registerNode({ from: unregisteredNodeTrusted2 });

            // Set node 1 withdrawal address
            await setNodeWithdrawalAddress(registeredNode1, node1WithdrawalAddress, { from: registeredNode1 });

            // Set nodes as trusted
            await setNodeTrusted(registeredNodeTrusted1, 'saas_1', 'node@home.com', owner);
            await setNodeTrusted(registeredNodeTrusted2, 'saas_2', 'node@home.com', owner);

            // Set max per-minipool stake to 100% and RPL price to 1 ether
            const block = await ethers.provider.getBlockNumber();
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.per.minipool.stake.maximum', '1'.ether, { from: owner });
            await submitPrices(block, slotTimestamp, '1'.ether, { from: registeredNodeTrusted1 });
            await submitPrices(block, slotTimestamp, '1'.ether, { from: registeredNodeTrusted2 });

            // Mint and stake RPL
            await mintRPL(owner, registeredNode1, '32'.ether);
            await mintRPL(owner, registeredNode2, '32'.ether);
            await nodeStakeRPL('32'.ether, { from: registeredNode1 });
            await nodeStakeRPL('32'.ether, { from: registeredNode2 });
        });

        /*** Setting Claimers *************************/

        it(printTitle('userOne', 'fails to set interval blocks for rewards claim period'), async () => {
            // Set the rewards claims interval in seconds
            await shouldRevert(setRewardsClaimIntervalTime(100, {
                from: userOne,
            }), 'Non owner set interval blocks for rewards claim period');
        });

        it(printTitle('guardian', 'succeeds setting interval blocks for rewards claim period'), async () => {
            // Set the rewards claims interval in blocks
            await setRewardsClaimIntervalTime(100, {
                from: owner,
            });
        });

        it(printTitle('userOne', 'fails to set contract claimer percentage for rewards'), async () => {
            // Set the amount this contract can claim
            await shouldRevert(setDAONetworkBootstrapRewardsClaimers('0.1'.ether, '0.5'.ether, '0.4'.ether, {
                from: userOne,
            }), 'Non owner set contract claimer percentage for rewards');
        });

        it(printTitle('guardian', 'set contract claimer percentage for rewards, then update it'), async () => {
            // Set the amount this contract can claim
            await setDAONetworkBootstrapRewardsClaimers('0.1'.ether, '0.1'.ether, '0.8'.ether, {
                from: owner,
            });
        });

        it(printTitle('guardian', 'fails to set contract claimer percentages to lower than 100% total'), async () => {
            // Set the amount this contract can claim
            await shouldRevert(setDAONetworkBootstrapRewardsClaimers('0.1'.ether, '0.1'.ether, '0.1'.ether, {
                from: owner,
            }), 'Percentages were updated', 'Total does not equal 100%');
        });

        it(printTitle('guardian', 'fails to set contract claimer percentages to greater than 100% total'), async () => {
            // Set the amount this contract can claim
            await shouldRevert(setDAONetworkBootstrapRewardsClaimers('0.4'.ether, '0.4'.ether, '0.4'.ether, {
                from: owner,
            }), 'Percentages were updated', 'Total does not equal 100%');
        });

        /*** Trusted Nodes *************************/

        it(printTitle('trusted node', 'can allocate ETH from smoothing pool to pDAO'), async () => {
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '0'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];

            const rocketSmoothingPool = await RocketSmoothingPool.deployed();
            const rocketRewardsPool = await RocketRewardsPool.deployed();

            // Send 0.5 ETH to smoothing pool
            await owner.sendTransaction({
                to: rocketSmoothingPool.target,
                value: '0.5'.ether,
            });

            // Send 0.5 ETH to rewards pool as "voter share"
            await rocketRewardsPool.depositVoterShare({ value: '0.5'.ether })

            // Submit reward submission with 1 ETH to treasury
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '1'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '1'.ether, { from: registeredNodeTrusted2 });
        })

        /*** Regular Nodes *************************/

        it(printTitle('node', 'can claim RPL and ETH'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Send ETH to rewards pool
            const rocketSmoothingPool = await RocketSmoothingPool.deployed();
            await owner.sendTransaction({
                to: rocketSmoothingPool.target,
                value: '20'.ether,
            });

            const rocketRewardsPool = await RocketRewardsPool.deployed();
            const pendingRewards = await rocketRewardsPool.getPendingETHRewards.call();

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
                {
                    address: registeredNode2.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '2'.ether,
                    nodeETH: '1'.ether,
                    voterETH: 0n
                },
                {
                    address: registeredNodeTrusted1.address,
                    network: 0,
                    trustedNodeRPL: '1'.ether,
                    nodeRPL: '2'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
                {
                    address: userOne.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1.333'.ether,
                    nodeETH: '0.3'.ether,
                    voterETH: 0n
                },
            ];
            await submitRewards(0, rewards, '0'.ether, '2'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '2'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Claim RPL
            await claimRewards(registeredNode1.address, [0], [rewards], {
                from: registeredNode1,
            });
            await claimRewards(registeredNode2.address, [0], [rewards], {
                from: registeredNode2,
            });
            await claimRewards(registeredNodeTrusted1.address, [0], [rewards], {
                from: registeredNodeTrusted1,
            });
            await claimRewards(userOne.address, [0], [rewards], {
                from: userOne,
            });

            // Do a second claim interval
            await submitRewards(1, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(1, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Claim RPL
            await claimRewards(registeredNode1.address, [1], [rewards], {
                from: registeredNode1,
            });
            await claimRewards(registeredNode2.address, [1], [rewards], {
                from: registeredNode2,
            });
        });

        it(printTitle('node', 'can claim from withdrawal address'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Send ETH to rewards pool
            const rocketSmoothingPool = await RocketSmoothingPool.deployed();
            await owner.sendTransaction({
                to: rocketSmoothingPool.target,
                value: '20'.ether,
            });

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Claim RPL
            await claimRewards(registeredNode1.address, [0], [rewards], {
                from: node1WithdrawalAddress,
            });
        });

        it(printTitle('node', 'can not claim with invalid proof'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];

            // Create 3 snapshots
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            let treeData = parseRewardsMap(rewards);
            let proof = treeData.proof.claims[ethers.getAddress(registeredNode1.address)];
            let rocketMerkleDistributorMainnet = await RocketMerkleDistributorMainnet.deployed();

            // Attempt to claim reward for registeredNode1 with registeredNode2
            const claim = {
                rewardIndex: 0,
                amountRPL: proof.amountRPL,
                amountSmoothingPoolETH: proof.amountSmoothingPoolETH,
                amountVoterETH: proof.amountVoterETH,
                merkleProof: proof.proof
            }
            await shouldRevert(rocketMerkleDistributorMainnet.connect(registeredNode2).claim(registeredNode2, [claim], { from: registeredNode2 }), 'Was able to claim with invalid proof', 'Invalid proof');
        });

        it(printTitle('node', 'can not claim same interval twice'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];

            // Create 3 snapshots
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });
            await submitRewards(1, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(1, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });
            await submitRewards(2, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(2, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Claim RPL
            await claimRewards(registeredNode1.address, [0, 1], [rewards, rewards], {
                from: registeredNode1,
            });
            await shouldRevert(claimRewards(registeredNode1.address, [0], [rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
            await shouldRevert(claimRewards(registeredNode1.address, [1], [rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
            await shouldRevert(claimRewards(registeredNode1.address, [0, 1], [rewards, rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
            await shouldRevert(claimRewards(registeredNode1.address, [0, 2], [rewards, rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
        });

        it(printTitle('node', 'can claim mulitiple periods in a single tx'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
                {
                    address: registeredNode2.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '2'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];

            // Submit 2 snapshots
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });
            await submitRewards(1, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(1, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });
            await submitRewards(2, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(2, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Claim RPL
            await claimRewards(registeredNode1.address, [0], [rewards], {
                from: registeredNode1,
            });
            await claimRewards(registeredNode1.address, [1, 2], [rewards, rewards], {
                from: registeredNode1,
            });
            await claimRewards(registeredNode2.address, [0, 1, 2], [rewards, rewards, rewards], {
                from: registeredNode2,
            });
        });

        it(printTitle('node', 'can claim RPL and stake'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
                {
                    address: registeredNode2.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '2'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Claim RPL
            await claimAndStakeRewards(registeredNode1.address, [0], [rewards], '1'.ether, {
                from: registeredNode1,
            });
            await claimAndStakeRewards(registeredNode2.address, [0], [rewards], '2'.ether, {
                from: registeredNode2,
            });

            // Do a second claim interval
            await submitRewards(1, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(1, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Claim RPL
            await claimAndStakeRewards(registeredNode1.address, [1], [rewards], '0.5'.ether, {
                from: registeredNode1,
            });
            await claimAndStakeRewards(registeredNode2.address, [1], [rewards], '1'.ether, {
                from: registeredNode2,
            });
        });

        it(printTitle('node', 'can not claim RPL and stake from non-rpl-withdrawal credential address if RPL withdrawal credentials set'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Set RPL withdrawal address to a random address
            await setNodeRPLWithdrawalAddress(registeredNode1, random, { from: node1WithdrawalAddress });

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Can't claim from node address
            await shouldRevert(claimAndStakeRewards(registeredNode1.address, [0], [rewards], '1'.ether, {
                from: registeredNode1,
            }), 'Was able to claim', 'Can only claim and stake from RPL withdrawal address');
            // Can't claim from withdrawal address
            await shouldRevert(claimAndStakeRewards(registeredNode1.address, [0], [rewards], '1'.ether, {
                from: node1WithdrawalAddress,
            }), 'Was able to claim', 'Can only claim and stake from RPL withdrawal address');
            // Can claim from rpl withdrawal address
            await claimAndStakeRewards(registeredNode1.address, [0], [rewards], '1'.ether, {
                from: random,
            });
        });

        it(printTitle('node', 'can claim and stake RPL from withdrawal address if RPL withdrawal address not set'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Can claim from withdrawal address
            await claimAndStakeRewards(registeredNode1.address, [0], [rewards], '1'.ether, {
                from: node1WithdrawalAddress,
            });
        });

        it(printTitle('node', 'can not stake amount greater than claim'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Claim RPL
            await shouldRevert(claimAndStakeRewards(registeredNode1.address, [0], [rewards], '2'.ether, {
                from: registeredNode1,
            }), 'Was able to stake amount greater than reward', 'Invalid stake amount');
        });

        it(printTitle('node', 'can claim RPL and stake multiple snapshots'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });
            await submitRewards(1, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(1, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Claim RPL
            await claimAndStakeRewards(registeredNode1.address, [0, 1], [rewards, rewards], '2'.ether, {
                from: registeredNode1,
            });
        });

        /*** Random *************************/

        it(printTitle('random', 'can execute reward period if consensus is reached'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Add another 2 trusted nodes so consensus becomes 3 votes
            await setNodeTrusted(unregisteredNodeTrusted1, 'saas_3', 'node@home.com', owner);
            await setNodeTrusted(unregisteredNodeTrusted2, 'saas_4', 'node@home.com', owner);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];

            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Kick a trusted node so consensus becomes 2 votes again
            await kickTrustedNode(unregisteredNodeTrusted1, [registeredNodeTrusted1, registeredNodeTrusted2, unregisteredNodeTrusted1]);

            // Now we should be able to execute the reward period
            await executeRewards(0, rewards, '0'.ether, '0'.ether, { from: random });
        });

        it(printTitle('random', 'cant execute reward period twice'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Add another 2 trusted nodes so consensus becomes 3 votes
            await setNodeTrusted(unregisteredNodeTrusted1, 'saas_3', 'node@home.com', owner);
            await setNodeTrusted(unregisteredNodeTrusted2, 'saas_4', 'node@home.com', owner);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];

            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Kick a trusted node so consensus becomes 2 votes again
            await kickTrustedNode(unregisteredNodeTrusted1, [registeredNodeTrusted1, registeredNodeTrusted2, unregisteredNodeTrusted1]);

            // Now we should be able to execute the reward period
            await executeRewards(0, rewards, '0'.ether, '0'.ether, { from: random });
            await shouldRevert(executeRewards(0, rewards, '0'.ether, '0'.ether, { from: random }), 'Already executed');
        });

        it(printTitle('random', 'can submit past consensus'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Add another trusted node 
            await setNodeTrusted(unregisteredNodeTrusted1, 'saas_3', 'node@home.com', owner);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];

            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });
            // already have consensus, should have executed
            await shouldRevert(executeRewards(0, rewards, '0'.ether, '0'.ether, { from: random }), 'Already executed');

            // should allow another vote past consensus
            await submitRewards(0, rewards, '0'.ether, '0'.ether, '0'.ether, { from: unregisteredNodeTrusted1 });

        });

        /*** Misc *************************/

        it(printTitle('misc', 'claim bitmap is correct'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether,
                    voterETH: 0n
                },
            ];

            // Submit 10 reward intervals
            for (let i = 0; i < 10; i++) {
                await submitRewards(i, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted1 });
                await submitRewards(i, rewards, '0'.ether, '0'.ether, '0'.ether, { from: registeredNodeTrusted2 });
            }

            // Some arbitrary intervals to claim
            let claimIntervals = [0, 4, 6, 9];

            await claimRewards(registeredNode1.address, claimIntervals, Array(claimIntervals.length).fill(rewards), {
                from: registeredNode1,
            });

            // Retrieve the bitmap of claims
            const rocketStorage = await RocketStorage.deployed();
            const key = ethers.solidityPackedKeccak256(
                ['string', 'address', 'uint256'],
                ['rewards.interval.claimed', registeredNode1.address, 0n],
            );
            const bitmap = Number(await rocketStorage.getUint(key));

            // Construct the expected bitmap and compare
            let expected = 0;
            for (let i = 0; i < claimIntervals.length; i++) {
                expected |= 1 << claimIntervals[i];
            }
            assert.strictEqual(bitmap, expected, 'Incorrect claimed bitmap');

            // Confirm second claim fails for each interval
            for (let i = 0; i < claimIntervals.length; i++) {
                await shouldRevert(claimRewards(registeredNode1.address, [claimIntervals[i]], [rewards], {
                    from: registeredNode1,
                }), 'Was able to claim again', 'Already claimed');
            }
        });

        it(printTitle('withdrawal address', 'can recover ETH rewards on reverting transfer to withdrawal address'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Set RPL withdrawal address to the revert on transfer helper
            const revertOnTransfer = await RevertOnTransfer.deployed();
            await setNodeWithdrawalAddress(registeredNode1, revertOnTransfer.target, { from: node1WithdrawalAddress });

            // Move to inflation start plus one claim interval
            let currentTime = BigInt(await helpers.time.latest());
            assertBN.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await helpers.time.increase(rplInflationStartTime - currentTime + claimIntervalTime);

            // Send ETH to rewards pool
            const rocketSmoothingPool = await RocketSmoothingPool.deployed();
            await owner.sendTransaction({
                to: rocketSmoothingPool.target,
                value: '20'.ether,
            });

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '0'.ether,
                    nodeETH: '1'.ether,
                    voterETH: 0n
                },
            ];
            await submitRewards(0, rewards, '0'.ether, '1'.ether, '0'.ether, { from: registeredNodeTrusted1 });
            await submitRewards(0, rewards, '0'.ether, '1'.ether, '0'.ether, { from: registeredNodeTrusted2 });

            // Claim from node which should fail to send the ETH and increase outstanding balance
            await claimAndStakeRewards(registeredNode1.address, [0], [rewards], '0'.ether, {
                from: registeredNode1,
            });

            const rocketMerkleDistributorMainnet = await RocketMerkleDistributorMainnet.deployed();

            // Check outstanding balance is correct
            const balance = await rocketMerkleDistributorMainnet.getOutstandingEth(revertOnTransfer.target);
            assertBN.equal(balance, '1'.ether);

            // Attempt to claim the ETH from the previously reverting withdrawal address
            await revertOnTransfer.setEnabled(false);
            const payload = rocketMerkleDistributorMainnet.interface.encodeFunctionData('claimOutstandingEth()');
            await revertOnTransfer.call(rocketMerkleDistributorMainnet.target, payload);

            // Check ETH was sent to withdrawal address
            const withdrawalAddressBalance = await ethers.provider.getBalance(revertOnTransfer.target);
            assertBN.equal(withdrawalAddressBalance, '1'.ether);
        });
    });
}
