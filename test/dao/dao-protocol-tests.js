import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    setDAOProtocolBootstrapEnableGovernance,
    setDaoProtocolBootstrapModeDisabled,
    setDAOProtocolBootstrapSecurityInvite,
    setDAOProtocolBootstrapSetting, setDAOProtocolBootstrapSettingAddressList,
    setDAOProtocolBootstrapSettingMulti,
} from './scenario-dao-protocol-bootstrap';
import {
    RocketDAOProtocolSettingsAuction,
    RocketDAOProtocolSettingsDeposit,
    RocketDAOProtocolSettingsInflation,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsProposals,
    RocketDAOProtocolSettingsRewards,
} from '../_utils/artifacts';
import {
    cloneLeaves,
    constructTreeLeaves,
    daoProtocolClaimBondChallenger,
    daoProtocolClaimBondProposer,
    daoProtocolCreateChallenge,
    daoProtocolDefeatProposal,
    daoProtocolExecute,
    daoProtocolFinalise,
    daoProtocolGenerateChallengeProof,
    daoProtocolGeneratePollard,
    daoProtocolGenerateVoteProof,
    daoProtocolOverrideVote,
    daoProtocolPropose,
    daoProtocolSubmitRoot,
    daoProtocolVote,
    getDelegatedVotingPower,
    getPhase2VotingPower,
    getSubIndex,
    setDaoProtocolNodeCommissionShare,
    setDaoProtocolNodeShareSecurityCouncilAdder,
    setDaoProtocolVoterShare,
} from './scenario-dao-protocol';
import {
    getNodeCount,
    nodeSetDelegate,
    nodeStakeRPL,
    registerNode,
    setRPLLockingAllowed,
} from '../_helpers/node';
import { getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import {
    getDaoProtocolChallengeBond,
    getDaoProtocolChallengePeriod,
    getDaoProtocolDepthPerRound,
    getDaoProtocolProposalBond,
    getDaoProtocolVoteDelayTime,
    getDaoProtocolVotePhase1Time,
    getDaoProtocolVotePhase2Time,
} from '../_helpers/dao';
import { assertBN } from '../_helpers/bn';
import { daoSecurityMemberJoin, getDAOSecurityMemberIsValid } from './scenario-dao-security';
import { voteStates } from './scenario-dao-proposal';
import * as assert from 'assert';
import { globalSnapShot } from '../_utils/snapshotting';
import { nodeDepositMulti } from '../_helpers/megapool';
import { unstakeRpl } from '../node/scenario-unstake-rpl';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketDAOProtocol', () => {
        // Accounts
        let owner, random, proposer, node1, node2, securityMember1, allowListed;
        let nodeMap = {};

        // Settings to retrieve
        let depthPerRound;
        let challengeBond;
        let proposalBond;
        let challengePeriod;
        let voteDelayTime;
        let votePhase1Time;
        let votePhase2Time;

        // Settings to apply
        const secondsPerEpoch = 384;
        const rewardClaimBalanceIntervals = 28;
        const balanceSubmissionFrequency = (24 * 60 * 60);
        const rewardClaimPeriodTime = (rewardClaimBalanceIntervals * balanceSubmissionFrequency * secondsPerEpoch); // 28 days

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
                random,
                proposer,
                node1,
                node2,
                securityMember1,
                allowListed,
            ] = await ethers.getSigners();

            // Add some ETH into the DP
            await userDeposit({ from: random, value: '320'.ether });

            // Retrieve settings
            depthPerRound = await getDaoProtocolDepthPerRound();
            challengeBond = await getDaoProtocolChallengeBond();
            proposalBond = await getDaoProtocolProposalBond();
            challengePeriod = await getDaoProtocolChallengePeriod();
            voteDelayTime = await getDaoProtocolVoteDelayTime();
            votePhase1Time = await getDaoProtocolVotePhase1Time();
            votePhase2Time = await getDaoProtocolVotePhase2Time();

            // Set the reward claim period
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.balances.frequency', balanceSubmissionFrequency, { from: owner });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rewards.claimsperiods', rewardClaimBalanceIntervals, { from: owner });
            // Set maximum minipool count higher for test
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.maximum.count', 100, { from: owner });
        });

        //
        // Utilities
        //

        function burnAmount(bond) {
            return bond * '0.2'.ether / '1'.ether;
        }

        function bondAfterBurn(bond) {
            return bond - burnAmount(bond);
        }

        //
        // Start Tests
        //

        // Update a setting
        it(printTitle('random', 'fails to update a setting as they are not the guardian'), async () => {
            // Fails to change a setting
            await shouldRevert(setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: random,
            }), 'User updated bootstrap setting', 'Account is not a temporary guardian');

        });

        // Update multiple settings
        it(printTitle('random', 'fails to update multiple settings as they are not the guardian'), async () => {
            // Fails to change multiple settings
            await shouldRevert(setDAOProtocolBootstrapSettingMulti([
                    RocketDAOProtocolSettingsAuction,
                    RocketDAOProtocolSettingsDeposit,
                    RocketDAOProtocolSettingsInflation,
                ],
                [
                    'auction.lot.create.enabled',
                    'deposit.minimum',
                    'rpl.inflation.interval.blocks',
                ],
                [
                    true,
                    '2'.ether,
                    400,
                ],
                {
                    from: random,
                }), 'User updated bootstrap setting', 'Account is not a temporary guardian');
        });

        // Verify each setting contract is enabled correctly. These settings are tested in greater detail in the relevent contracts
        it(printTitle('guardian', 'updates a setting in each settings contract while bootstrap mode is enabled'), async () => {
            // Set via bootstrapping
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: owner,
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.minimum', '2'.ether, {
                from: owner,
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsInflation, 'rpl.inflation.interval.blocks', 400, {
                from: owner,
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.submit.withdrawable.enabled', true, {
                from: owner,
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.enabled', true, {
                from: owner,
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rpl.rewards.claim.period.blocks', 100, {
                from: owner,
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsInflation, 'network.reth.deposit.delay', 500, {
                from: owner,
            });
        });

        // Verify each setting contract is enabled correctly. These settings are tested in greater detail in the relevent contracts
        it(printTitle('guardian', 'updates multiple settings at once while bootstrap mode is enabled'), async () => {
            // Set via bootstrapping
            await setDAOProtocolBootstrapSettingMulti([
                    RocketDAOProtocolSettingsAuction,
                    RocketDAOProtocolSettingsDeposit,
                    RocketDAOProtocolSettingsInflation,
                ],
                [
                    'auction.lot.create.enabled',
                    'deposit.minimum',
                    'rpl.inflation.interval.blocks',
                ],
                [
                    true,
                    '2'.ether,
                    400,
                ],
                {
                    from: owner,
                });
        });

        // Update a setting, then try again
        it(printTitle('guardian', 'updates a setting, then fails to update a setting again after bootstrap mode is disabled'), async () => {
            // Set via bootstrapping
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: owner,
            });
            // Enable governance so we can disable bootstrap
            await setDAOProtocolBootstrapEnableGovernance({ from: owner });
            // Disable bootstrap mode
            await setDaoProtocolBootstrapModeDisabled({
                from: owner,
            });
            // Attempt to change a setting again
            await shouldRevert(setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: owner,
            }), 'Guardian updated bootstrap setting after mode disabled', 'Bootstrap mode not engaged');

        });

        // Update multiple settings, then try again
        it(printTitle('guardian', 'updates multiple settings, then fails to update multiple settings again after bootstrap mode is disabled'), async () => {
            // Set via bootstrapping
            await setDAOProtocolBootstrapSettingMulti([
                    RocketDAOProtocolSettingsAuction,
                    RocketDAOProtocolSettingsDeposit,
                    RocketDAOProtocolSettingsInflation,
                ],
                [
                    'auction.lot.create.enabled',
                    'deposit.minimum',
                    'rpl.inflation.interval.blocks',
                ],
                [
                    true,
                    '2'.ether,
                    400,
                ],
                {
                    from: owner,
                });
            // Enable governance so we can disable bootstrap
            await setDAOProtocolBootstrapEnableGovernance({ from: owner });
            // Disable bootstrap mode
            await setDaoProtocolBootstrapModeDisabled({
                from: owner,
            });
            // Attempt to change a setting again
            await shouldRevert(setDAOProtocolBootstrapSettingMulti([
                    RocketDAOProtocolSettingsAuction,
                    RocketDAOProtocolSettingsDeposit,
                    RocketDAOProtocolSettingsInflation,
                ],
                [
                    'auction.lot.create.enabled',
                    'deposit.minimum',
                    'rpl.inflation.interval.blocks',
                ],
                [
                    true,
                    '2'.ether,
                    400,
                ],
                {
                    from: owner,
                }), 'Guardian updated bootstrap setting after mode disabled', 'Bootstrap mode not engaged');

        });

        async function createNode(validatorCount, node) {
            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake * validatorCount.BN;
            const nodeCount = await getNodeCount();
            await registerNode({ from: node });
            nodeMap[node.address] = Number(nodeCount);
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, { from: node });
            // Create validators
            const deposits = Array(validatorCount).fill({
                bondAmount: '4'.ether,
                useExpressTicket: false,
            })
            await nodeDepositMulti(node, deposits);
            // Allow RPL locking by default
            await setRPLLockingAllowed(node, true, { from: node });
        }

        async function createValidProposal(name = 'Test proposal', payload = '0x00', block = null) {
            // Setup
            if (block === null) {
                block = await ethers.provider.getBlockNumber();
            }
            const power = await getDelegatedVotingPower(block);
            const leaves = constructTreeLeaves(power);

            // Create the proposal
            let pollard = await daoProtocolGeneratePollard(leaves, depthPerRound);
            let propId = await daoProtocolPropose(name, payload, block, pollard, { from: proposer });

            return {
                block,
                propId,
                power,
                leaves,
            };
        }

        async function mockNodeSet() {
            let accounts = await ethers.getSigners();

            let newAccounts = [];
            for (let i = 10; i < 50; i++) {
                // Create pseudo-random number of minpools
                const count = ((i * 7) % 5) + 1;
                await createNode(count, accounts[i]);
                newAccounts.push(accounts[i]);
            }
            return newAccounts;
        }

        async function voteAll(proposalId, leaves, direction) {
            let accounts = await ethers.getSigners();

            // Vote from each account until the proposal passes
            for (let i = 10; i < 50; i++) {
                const nodeIndex = nodeMap[accounts[i].address];
                const voteProof = daoProtocolGenerateVoteProof(leaves, nodeIndex);

                try {
                    if (voteProof.sum > 0n) {
                        await daoProtocolVote(proposalId, direction, voteProof.sum, nodeIndex, voteProof.witness, { from: accounts[i] });
                    }
                } catch (e) {
                    if (e.message.indexOf('Proposal has passed') !== -1) {
                        return;
                    } else {
                        throw e;
                    }
                }
            }
        }

        function getRoundCount(leafCount) {
            const maxDepth = Math.ceil(Math.log2(leafCount));
            const totalLeaves = 2 ** maxDepth;
            let rounds = Math.ceil(Math.floor(Math.log2(totalLeaves)) / depthPerRound) - 1;

            if (rounds === 0) {
                rounds = 1;
            }

            return rounds;
        }

        function getMaxDepth(leafCount) {
            return Math.ceil(Math.log2(leafCount));
        }

        function getChallengeIndices(finalIndex, leafCount) {
            const phase1Indices = [];
            const phase2Indices = [];

            const phase1Depth = getMaxDepth(leafCount);
            const phase2Depth = phase1Depth * 2;

            const subRootIndex = finalIndex / Math.pow(2, phase1Depth);

            const roundsPerPhase = getRoundCount(leafCount);

            for (let i = 1; i <= roundsPerPhase; i++) {
                let challengeDepth = i * depthPerRound;
                if (challengeDepth <= phase1Depth) {
                    const index = subRootIndex / (2 ** (phase1Depth - challengeDepth));
                    if (index !== subRootIndex) {
                        phase1Indices.push(index);
                    }
                }
            }

            for (let i = 1; i <= roundsPerPhase; i++) {
                let challengeDepth = phase1Depth + (i * depthPerRound);
                if (challengeDepth <= phase2Depth) {
                    phase2Indices.push(finalIndex / (2 ** (phase2Depth - challengeDepth)));
                }
            }

            return { phase1Indices, subRootIndex, phase2Indices };
        }

        /*
         * Proposer
         */

        describe('With Node Operators', () => {
            let nodes;

            before(async () => {
                nodes = await mockNodeSet();
                await createNode(1, proposer);
            });

            it(printTitle('proposer', 'can not create a proposal until enabled by guardian'), async () => {
                // Create a valid proposal
                await shouldRevert(createValidProposal(), 'Was able to create proposal', 'DAO has not been enabled');
            });

            it(printTitle('proposer', 'can disable bootstrap after enabling DAO'), async () => {
                // Should fail before enabling governance
                await shouldRevert(setDaoProtocolBootstrapModeDisabled({ from: owner }), 'Was able to disable bootstrap', 'On-chain governance must be enabled first');
                // Enable governance
                await setDAOProtocolBootstrapEnableGovernance({ from: owner });
                // Should succeed
                await setDaoProtocolBootstrapModeDisabled({ from: owner });
            });

            describe('With Governance Enabled', () => {
                before(async () => {
                    await setDAOProtocolBootstrapEnableGovernance({ from: owner });
                });

                it(printTitle('proposer', 'can successfully submit a proposal'), async () => {
                    await createValidProposal();
                });

                it(printTitle('proposer', 'can not submit a proposal with a past block'), async () => {
                    const block = await ethers.provider.getBlockNumber() + 5;
                    await shouldRevert(createValidProposal('Test proposal', '0x00', block), 'Was able to create proposal with future block', 'Block must be in the past');
                });

                it(printTitle('proposer', 'can not submit a proposal if locking is not allowed'), async () => {
                    // Setup
                    await setRPLLockingAllowed(proposer, false, { from: proposer });
                    // Create a valid proposal
                    await shouldRevert(createValidProposal(), 'Was able to create proposal', 'Node is not allowed to lock RPL');
                });

                it(printTitle('proposer', 'can unstake excess RPL after it is unlocked'), async () => {
                    // Give the proposer 150% collateral + proposal bond + 50
                    await mintRPL(owner, proposer, '2390'.ether);
                    await nodeStakeRPL('2390'.ether, { from: proposer });

                    // Create a valid proposal
                    const { propId } = await createValidProposal();

                    // Wait for withdraw cooldown
                    await helpers.time.increase(voteDelayTime + 1);

                    // Let the proposal expire to unlock the bond
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Claim bond
                    await daoProtocolClaimBondProposer(propId, [1], { from: proposer });

                    // Wait the withdrawal cooldown time
                    await helpers.time.increase(rewardClaimPeriodTime + 1);

                    // Unstake excess
                    await unstakeRpl('150'.ether, { from: proposer });
                });

                it(printTitle('proposer', 'can not create proposal with invalid leaf count'), async () => {
                    // Try to create invalid proposal
                    const block = await ethers.provider.getBlockNumber();
                    const power = await getDelegatedVotingPower(block);
                    const leaves = constructTreeLeaves(power);

                    // Too few
                    let invalidLeaves = leaves.slice(0, 1);
                    await shouldRevert(daoProtocolPropose('Test proposal', '0x00', block, invalidLeaves, { from: proposer }), 'Was able to create proposal', 'Invalid node count');

                    // Too many
                    invalidLeaves = [...leaves, ...leaves];
                    await shouldRevert(daoProtocolPropose('Test proposal', '0x00', block, invalidLeaves, { from: proposer }), 'Was able to create proposal', 'Invalid node count');
                });

                it(printTitle('proposer', 'can not claim bond on defeated proposal'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Challenge/response
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                    const index = indices[0];
                    // Challenge
                    const challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                    await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                    // Let the challenge expire
                    await helpers.time.increase(challengePeriod + 1);

                    // Defeat it
                    await daoProtocolDefeatProposal(propId, index, { from: challenger });

                    // Try to claim bond
                    await shouldRevert(daoProtocolClaimBondProposer(propId, [1], { from: proposer }), 'Was able to claim bond', 'Proposal defeated');
                });

                it(printTitle('proposer', 'can not claim bond twice'), async () => {
                    // Create a minipool with a node to use as a challenger
                    await createNode(1, node1);

                    // Create a valid proposal
                    const { propId } = await createValidProposal();

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Let the proposal expire to unlock the bond
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Claim bond
                    await daoProtocolClaimBondProposer(propId, [1], { from: proposer });

                    // Try claim bond again
                    await shouldRevert(daoProtocolClaimBondProposer(propId, [1], { from: proposer }), 'Claimed bond twice', 'Invalid challenge state');
                });

                it(printTitle('proposer', 'can not claim reward twice'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Create some invalid challenges
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices.slice(0, 1);
                    for (const index of indices) {
                        // Challenge
                        const challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });
                        // Response
                        let pollard = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                        await daoProtocolSubmitRoot(propId, index, pollard, { from: proposer });
                    }

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Let the proposal expire to unlock the bond
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Claim bond and rewards
                    await daoProtocolClaimBondProposer(propId, [1, ...indices], { from: proposer });

                    // Try claim reward again
                    await shouldRevert(daoProtocolClaimBondProposer(propId, [indices[0]], { from: proposer }), 'Claimed reward twice', 'Invalid challenge state');
                });

                it(printTitle('proposer', 'can not claim reward for unresponded index'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Create some invalid challenges
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices.slice(0, 1);
                    const index = indices[0];
                    // Challenge
                    const challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                    await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Let the proposal expire to unlock the bond
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Try to claim reward for unresponded index
                    await shouldRevert(daoProtocolClaimBondProposer(propId, [indices[0]], { from: proposer }), 'Was able to claim reward', 'Invalid challenge state');
                });

                it(printTitle('proposer', 'can not claim reward for unchallenged index'), async () => {
                    // Create a minipool with a node to use as a challenger
                    await createNode(1, node1);

                    // Create a valid proposal
                    const { propId } = await createValidProposal();

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Let the proposal expire to unlock the bond
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Try to claim reward for unchallenged index
                    await shouldRevert(daoProtocolClaimBondProposer(propId, [2], { from: proposer }), 'Was able to claim reward', 'Invalid challenge state');
                });

                it(printTitle('proposer', 'can not respond to a challenge with an invalid pollard'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Challenge/response
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                    const index = indices[0];
                    // Challenge
                    const challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                    await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                    // Response
                    let pollard = await daoProtocolGeneratePollard(leaves, depthPerRound, index);

                    // Try with an invalid nodes (incorrect node count)
                    await shouldRevert(daoProtocolSubmitRoot(propId, index, pollard.slice(0, 1), { from: proposer }), 'Accepted invalid nodes', 'Invalid node count');

                    // Try with an invalid nodes (invalid node sum)
                    let invalidNodes = cloneLeaves(pollard);
                    invalidNodes[0].sum = invalidNodes[0].sum + 1n;
                    await shouldRevert(daoProtocolSubmitRoot(propId, index, invalidNodes, { from: proposer }), 'Accepted invalid nodes', 'Invalid sum');

                    // Try with an invalid nodes (invalid node hash)
                    invalidNodes = cloneLeaves(pollard);
                    invalidNodes[0].hash = '0x'.padEnd(66, '0');
                    await shouldRevert(daoProtocolSubmitRoot(propId, index, invalidNodes, { from: proposer }), 'Accepted invalid nodes', 'Invalid hash');
                });

                it(printTitle('proposer', 'can not respond to a challenge with an invalid leaves'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Create an invalid proposal
                    const block = await ethers.provider.getBlockNumber();
                    let power = await getDelegatedVotingPower(block);
                    power[0] = '1000'.ether;
                    const leaves = constructTreeLeaves(power);

                    // Create the proposal
                    let nodes = await daoProtocolGeneratePollard(leaves, depthPerRound);
                    let propId = await daoProtocolPropose('Test proposal', '0x00', block, nodes, { from: proposer });

                    // Challenge/response
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const {
                        phase1Indices,
                        subRootIndex,
                        phase2Indices,
                    } = getChallengeIndices(2 ** maxDepth, leaves.length);

                    // Phase 1
                    for (const index of phase1Indices) {
                        // Challenge
                        const challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });
                        // Response
                        let pollard = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                        await daoProtocolSubmitRoot(propId, index, pollard, { from: proposer });
                    }

                    let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, subRootIndex);
                    await daoProtocolCreateChallenge(propId, subRootIndex, challenge.node, challenge.proof, { from: challenger });

                    // Generate the sub tree
                    const challengedNodeId = subRootIndex - (2 ** phase1Depth);
                    let subTreePower = await getPhase2VotingPower(block, challengedNodeId);
                    subTreePower[0] = '1000'.ether;
                    const subTreeLeaves = await constructTreeLeaves(subTreePower);

                    let subIndex = getSubIndex(subRootIndex, subTreeLeaves);
                    let pollard = await daoProtocolGeneratePollard(subTreeLeaves, depthPerRound, subIndex);
                    await daoProtocolSubmitRoot(propId, subRootIndex, pollard, { from: proposer });

                    // Phase 2
                    for (const index of phase2Indices.slice(0, phase2Indices.length - 1)) {
                        // Challenge
                        let subIndex = getSubIndex(index, subTreeLeaves);
                        const challenge = daoProtocolGenerateChallengeProof(subTreeLeaves, depthPerRound, subIndex);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });
                        // Response
                        let pollard = await daoProtocolGeneratePollard(subTreeLeaves, depthPerRound, subIndex);
                        await daoProtocolSubmitRoot(propId, index, pollard, { from: proposer });
                    }

                    const finalChallengeIndex = phase2Indices[phase2Indices.length - 1];

                    // Challenge final round
                    // await daoProtocolCreateChallenge(propId, finalChallengeIndex, { from: challenger });
                    subIndex = getSubIndex(finalChallengeIndex, subTreeLeaves);
                    challenge = daoProtocolGenerateChallengeProof(subTreeLeaves, depthPerRound, subIndex);
                    await daoProtocolCreateChallenge(propId, finalChallengeIndex, challenge.node, challenge.proof, { from: challenger });

                    // Response
                    pollard = await daoProtocolGeneratePollard(subTreeLeaves, depthPerRound, subIndex);
                    await shouldRevert(daoProtocolSubmitRoot(propId, finalChallengeIndex, pollard, { from: proposer }), 'Accepted invalid leaves', 'Invalid leaves');
                });

                it(printTitle('proposer', 'can not respond to a challenge with an invalid leaves (invalid primary tree leaf hash)'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Create an invalid proposal
                    const block = await ethers.provider.getBlockNumber();
                    let power = await getDelegatedVotingPower(block);
                    let leaves = constructTreeLeaves(power);
                    leaves[0].sum = leaves[0].sum + 100000n;

                    // Create the proposal
                    let nodes = await daoProtocolGeneratePollard(leaves, depthPerRound);
                    let propId = await daoProtocolPropose('Test proposal', '0x00', block, nodes, { from: proposer });

                    // Challenge/response
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const {
                        phase1Indices,
                        subRootIndex,
                        phase2Indices,
                    } = getChallengeIndices(2 ** maxDepth, leaves.length);

                    // Phase 1
                    for (const index of phase1Indices) {
                        // Challenge
                        const challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });
                        // Response
                        let pollard = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                        await daoProtocolSubmitRoot(propId, index, pollard, { from: proposer });
                    }

                    let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, subRootIndex);
                    await daoProtocolCreateChallenge(propId, subRootIndex, challenge.node, challenge.proof, { from: challenger });

                    // Generate the subtree
                    const challengedNodeId = subRootIndex - (2 ** phase1Depth);
                    const subTreePower = await getPhase2VotingPower(block, challengedNodeId);
                    let subTreeLeaves = await constructTreeLeaves(subTreePower);
                    subTreeLeaves[0].sum = subTreeLeaves[0].sum + 100000n;

                    let subIndex = getSubIndex(subRootIndex, subTreeLeaves);
                    let pollard = await daoProtocolGeneratePollard(subTreeLeaves, depthPerRound, subIndex);
                    await shouldRevert(daoProtocolSubmitRoot(propId, subRootIndex, pollard, { from: proposer }), 'Accepted invalid hash', 'Invalid hash');
                });

                it(printTitle('voter', 'can not set delegate to same value'), async () => {
                    await nodeSetDelegate(nodes[1].address, { from: nodes[0] });
                    await shouldRevert(
                        nodeSetDelegate(nodes[1].address, { from: nodes[0] }),
                        'Was able to set delegate to same value',
                        'Delegate already set to value'
                    );
                });

                /**
                 * Override Votes
                 */

                it(printTitle('voter', 'can vote against their delegate'), async () => {
                    // Setup
                    await nodeSetDelegate(nodes[1].address, { from: nodes[0] });

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Vote all in favour
                    await voteAll(propId, leaves, voteStates.For);

                    // Skip phase 1 of the voting period
                    await helpers.time.increase(votePhase1Time + 1);

                    // Have node[0] vote against vote[1]s for vote with an against vote
                    await daoProtocolOverrideVote(propId, voteStates.Against, { from: nodes[0] });
                });

                it(printTitle('voter', 'can not override vote in the same direction as their delegate'), async () => {
                    // Setup
                    await nodeSetDelegate(nodes[1].address, { from: nodes[0] });

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Vote all in favour
                    await voteAll(propId, leaves, voteStates.For);

                    // Skip phase 1 of the voting period
                    await helpers.time.increase(votePhase1Time + 1);

                    // Try to override vote with a for (checks for failure internally)
                    await daoProtocolOverrideVote(propId, voteStates.For, { from: nodes[0] });
                });

                it(printTitle('voter', 'can vote in same direction as delegate if both voting in phase 2'), async () => {
                    // Setup
                    await nodeSetDelegate(nodes[1].address, { from: nodes[0] });

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Skip phase 1 of the voting period
                    await helpers.time.increase(votePhase1Time + 1);

                    // Vote for from delegate
                    await daoProtocolOverrideVote(propId, voteStates.For, { from: nodes[1] });

                    // Vote for from node
                    await daoProtocolOverrideVote(propId, voteStates.For, { from: nodes[0] });
                });

                it(printTitle('voter', 'can not vote in phase 1 then in phase 2'), async () => {
                    // Setup
                    await nodeSetDelegate(nodes[1].address, { from: nodes[0] });

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Vote as a delegate
                    const nodeIndex = nodeMap[nodes[1].address];
                    const voteProof = daoProtocolGenerateVoteProof(leaves, nodeIndex);
                    await daoProtocolVote(propId, voteStates.For, voteProof.sum, nodeIndex, voteProof.witness, { from: nodes[1] });

                    // Skip phase 1 of the voting period
                    await helpers.time.increase(votePhase1Time + 1);

                    // Try to override own vote
                    await shouldRevert(daoProtocolOverrideVote(propId, voteStates.Against, { from: nodes[1] }), 'Was able to override self', 'Node operator has already voted on proposal');
                });

                /**
                 * Failed Proposals
                 */

                it(printTitle('proposer', 'cannot execute a failed proposal'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Invite security council member
                    let ABI = ['function proposalSecurityInvite(string,address)'];
                    let iface = new ethers.Interface(ABI);
                    let proposalCalldata = iface.encodeFunctionData('proposalSecurityInvite', ['Security Member 1', securityMember1.address]);

                    // Create a valid proposal
                    const {
                        propId,
                        leaves,
                    } = await createValidProposal('Invite security member to the council', proposalCalldata);

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Vote all in favour
                    await voteAll(propId, leaves, voteStates.Against);

                    // Skip the full vote period
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Fail to execute the proposal
                    await shouldRevert(daoProtocolExecute(propId, { from: proposer }), 'Was able to execute failed proposal', 'Proposal has not succeeded, has expired or has already been executed');

                    // Fail to accept the invitation
                    await shouldRevert(daoSecurityMemberJoin({ from: securityMember1 }), 'Was able to join on failed invite', 'This address has not been invited to join');
                });

                it(printTitle('proposer', 'can not execute a vetoed proposal but can destroy it'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Invite security council member
                    let ABI = ['function proposalSecurityInvite(string,address)'];
                    let iface = new ethers.Interface(ABI);
                    let proposalCalldata = iface.encodeFunctionData('proposalSecurityInvite', ['Security Member 1', securityMember1.address]);

                    // Create a valid proposal
                    const {
                        propId,
                        leaves,
                    } = await createValidProposal('Invite security member to the council', proposalCalldata);

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Vote all in favour
                    await voteAll(propId, leaves, voteStates.AgainstWithVeto);

                    // Skip the full vote period
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Fail to execute the proposal
                    await shouldRevert(daoProtocolExecute(propId, { from: proposer }), 'Was able to execute failed proposal', 'Proposal has not succeeded, has expired or has already been executed');

                    // Finalise the vetoed proposal
                    await daoProtocolFinalise(propId, { from: proposer });
                });

                /**
                 * Successful Proposals
                 */

                it(printTitle('proposer', 'can invite a security council member'), async () => {
                    // Invite security council member
                    let ABI = ['function proposalSecurityInvite(string,address)'];
                    let iface = new ethers.Interface(ABI);
                    let proposalCalldata = iface.encodeFunctionData('proposalSecurityInvite', ['Security Member 1', securityMember1.address]);

                    // Create a valid proposal
                    const {
                        propId,
                        leaves,
                    } = await createValidProposal('Invite security member to the council', proposalCalldata);

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Vote all in favour
                    await voteAll(propId, leaves, voteStates.For);

                    // Skip the full vote period
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Execute the proposal
                    await daoProtocolExecute(propId, { from: proposer });

                    // Accept the invitation
                    await daoSecurityMemberJoin({ from: securityMember1 });
                });

                it(printTitle('proposer', 'can kick a security council member'), async () => {
                    // Setup
                    await setDAOProtocolBootstrapSecurityInvite('Member', securityMember1, { from: owner });
                    await daoSecurityMemberJoin({ from: securityMember1 });

                    // Invite security council member
                    let ABI = ['function proposalSecurityKick(address)'];
                    let iface = new ethers.Interface(ABI);
                    let proposalCalldata = iface.encodeFunctionData('proposalSecurityKick', [securityMember1.address]);

                    // Create a valid proposal
                    const {
                        propId,
                        leaves,
                    } = await createValidProposal('Kick security member from the council', proposalCalldata);

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Vote all in favour
                    await voteAll(propId, leaves, voteStates.For);

                    // Skip the full vote period
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Execute the proposal
                    await daoProtocolExecute(propId, { from: proposer });

                    // Member should no longer exists
                    assert.equal(await getDAOSecurityMemberIsValid(securityMember1), false, 'Member still exists in council');
                });

                it(printTitle('proposer', 'can not kick a security council member that does not exist'), async () => {
                    // Setup
                    await setDAOProtocolBootstrapSecurityInvite('Member', securityMember1, { from: owner });
                    await daoSecurityMemberJoin({ from: securityMember1 });

                    // Invite security council member
                    let ABI = ['function proposalSecurityKick(address)'];
                    let iface = new ethers.Interface(ABI);
                    let proposalCalldata = iface.encodeFunctionData('proposalSecurityKick', [random.address]);

                    // Create a valid proposal
                    const {
                        propId,
                        leaves,
                    } = await createValidProposal('Kick security member from the council', proposalCalldata);

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Vote all in favour
                    await voteAll(propId, leaves, voteStates.For);

                    // Skip the full vote period
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Execute the proposal
                    await shouldRevert(
                        daoProtocolExecute(propId, { from: proposer }),
                        'Was able to kick non-existing member',
                        'This node is not part of the security council'
                    );
                });

                it(printTitle('proposer', 'can replace a security council member'), async () => {
                    // Setup
                    await setDAOProtocolBootstrapSecurityInvite('Member', securityMember1, { from: owner });
                    await daoSecurityMemberJoin({ from: securityMember1 });

                    // Invite security council member
                    let ABI = ['function proposalSecurityReplace(address, string, address)'];
                    let iface = new ethers.Interface(ABI);
                    let proposalCalldata = iface.encodeFunctionData('proposalSecurityReplace', [securityMember1.address, 'Replaced Member 1', random.address]);

                    // Create a valid proposal
                    const {
                        propId,
                        leaves,
                    } = await createValidProposal('Replace security council member', proposalCalldata);

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Vote all in favour
                    await voteAll(propId, leaves, voteStates.For);

                    // Skip the full vote period
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Execute the proposal
                    await daoProtocolExecute(propId, { from: proposer });

                    // Accept on new member address
                    await daoSecurityMemberJoin({ from: random });

                    // Old member should no longer exists
                    assert.equal(await getDAOSecurityMemberIsValid(securityMember1), false, 'Member still exists in council');

                    // New member should exit
                    assert.equal(await getDAOSecurityMemberIsValid(random), true, 'Member is not in council');
                });

                /**
                 * Challenger
                 */

                it(printTitle('challenger', 'can not challenge with insufficient RPL'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Set challenge bond to some high value
                    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsProposals, 'proposal.challenge.bond', '10000'.ether, { from: owner });

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Challenge/response
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                    const index = indices[0];

                    // Challenge
                    let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                    await shouldRevert(daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger }), 'Was able to challenge', 'Not enough staked RPL');
                });

                it(printTitle('challenger', 'can not challenge if locking RPL is not allowed'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);
                    await setRPLLockingAllowed(challenger, false, { from: challenger });

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Challenge/response
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                    const index = indices[0];

                    // Challenge
                    let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                    await shouldRevert(daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger }), 'Was able to challenge', 'Node is not allowed to lock RPL');
                });

                it(printTitle('challenger', 'can claim share on defeated proposal'), async () => {
                    // Create a minipool with a node to use as challengers
                    let challenger1 = node1;
                    await createNode(1, challenger1);
                    let challenger2 = node2;
                    await createNode(1, challenger2);

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Challenge/response
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const { phase1Indices, subRootIndex } = getChallengeIndices(2 ** maxDepth, leaves.length);
                    const indices = [...phase1Indices, subRootIndex];

                    // Challenge first round
                    let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, indices[0]);
                    await daoProtocolCreateChallenge(propId, indices[0], challenge.node, challenge.proof, { from: challenger1 });

                    // Response
                    let pollard = await daoProtocolGeneratePollard(leaves, depthPerRound, indices[0]);
                    await daoProtocolSubmitRoot(propId, indices[0], pollard, { from: proposer });

                    // Challenge second round
                    challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, indices[1]);
                    await daoProtocolCreateChallenge(propId, indices[1], challenge.node, challenge.proof, { from: challenger2 });

                    // Let the challenge expire
                    await helpers.time.increase(challengePeriod + 1);

                    // Defeat it
                    await daoProtocolDefeatProposal(propId, indices[1], { from: challenger2 });

                    // Claim bond on invalid index
                    const deltas1 = await daoProtocolClaimBondChallenger(propId, [indices[0]], { from: challenger1 });
                    const deltas2 = await daoProtocolClaimBondChallenger(propId, [indices[1]], { from: challenger2 });

                    // Each should receive 1/2 of the proposal bond as a reward and their challenge bond back (with 20% being burned)
                    assertBN.equal(deltas1.staked, bondAfterBurn(proposalBond / 2n));
                    assertBN.equal(deltas2.staked, bondAfterBurn(proposalBond / 2n));
                    assertBN.equal(deltas1.locked, -challengeBond);
                    assertBN.equal(deltas2.locked, -challengeBond);
                    assertBN.equal(deltas1.burned, burnAmount(proposalBond / 2n));
                    assertBN.equal(deltas2.burned, burnAmount(proposalBond / 2n));
                });

                it(printTitle('challenger', 'can recover bond if index was not used'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger1 = node1;
                    await createNode(1, challenger1);
                    let challenger2 = node2;
                    await createNode(1, challenger2);

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Challenge/response
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                    const index = indices[0];

                    // Challenge
                    let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                    await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger1 });
                    challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index + 1);
                    await daoProtocolCreateChallenge(propId, index + 1, challenge.node, challenge.proof, { from: challenger2 });

                    // Let the challenge expire
                    await helpers.time.increase(challengePeriod + 1);

                    // Defeat it
                    await daoProtocolDefeatProposal(propId, index, { from: challenger1 });

                    // Recover bond
                    const deltas1 = await daoProtocolClaimBondChallenger(propId, [index], { from: challenger1 });
                    const deltas2 = await daoProtocolClaimBondChallenger(propId, [index + 1], { from: challenger2 });

                    assertBN.equal(deltas1.locked, -challengeBond);
                    assertBN.equal(deltas1.staked, bondAfterBurn(proposalBond));
                    assertBN.equal(deltas1.burned, burnAmount(proposalBond));
                    assertBN.equal(deltas2.locked, -challengeBond);
                    assertBN.equal(deltas2.staked, 0n);
                    assertBN.equal(deltas2.burned, 0n);
                });

                /**
                 * Other
                 */

                it(printTitle('other', 'can not claim reward on challenge they did not make'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Create node for invalid claim
                    await createNode(1, node2);

                    // Create a valid proposal
                    const { propId, leaves } = await createValidProposal();

                    // Challenge/response
                    const phase1Depth = getMaxDepth(leaves.length);
                    const maxDepth = phase1Depth * 2;
                    const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                    const index = indices[0];
                    // Challenge
                    let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                    await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                    // Let the challenge expire
                    await helpers.time.increase(challengePeriod + 1);

                    // Defeat it
                    await daoProtocolDefeatProposal(propId, index, { from: challenger });

                    // Claim bond on invalid index
                    await shouldRevert(daoProtocolClaimBondChallenger(propId, [indices[0]], { from: node2 }), 'Was able to claim reward', 'Invalid challenger');
                });

                it(printTitle('other', 'can not claim bond on a proposal they did not make'), async () => {
                    // Create a minipool with a node to use as a challenger
                    let challenger = node1;
                    await createNode(1, challenger);

                    // Create node for invalid claim
                    await createNode(1, node2);

                    // Create a valid proposal
                    const { propId } = await createValidProposal();

                    // Wait for proposal wait period to end
                    await helpers.time.increase(voteDelayTime + 1);

                    // Let the proposal expire to unlock the bond
                    await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                    // Claim bond on invalid index
                    await shouldRevert(daoProtocolClaimBondProposer(propId, [1], { from: node2 }), 'Was able to claim proposal bond', 'Not proposer');
                });

                describe('With Valid Proposal', () => {
                    let challenger;
                    let propId, leaves, block;
                    let phase1Depth, maxDepth;

                    before(async () => {
                        // Create a minipool with a node to use as a challenger
                        challenger = node1;
                        await createNode(1, challenger);

                        // Create a valid proposal
                        let proposal = await createValidProposal();

                        propId = proposal.propId;
                        leaves = proposal.leaves;
                        block = proposal.block;

                        phase1Depth = getMaxDepth(leaves.length);
                        maxDepth = phase1Depth * 2;
                    });

                    it(printTitle('proposer', 'can successfully refute an invalid challenge'), async () => {
                        // Challenge/response
                        const {
                            phase1Indices,
                            subRootIndex,
                            phase2Indices,
                        } = getChallengeIndices(2 ** maxDepth, leaves.length);

                        // Phase 1
                        for (const index of phase1Indices) {
                            // Challenge
                            const challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                            await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });
                            // Response
                            let pollard = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                            await daoProtocolSubmitRoot(propId, index, pollard, { from: proposer });
                        }

                        const challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, subRootIndex);
                        await daoProtocolCreateChallenge(propId, subRootIndex, challenge.node, challenge.proof, { from: challenger });

                        // Generate the subtree
                        const challengedNodeId = subRootIndex - (2 ** phase1Depth);
                        const subTreePower = await getPhase2VotingPower(block, challengedNodeId);
                        const subTreeLeaves = await constructTreeLeaves(subTreePower);

                        let subIndex = getSubIndex(subRootIndex, subTreeLeaves);
                        let pollard = await daoProtocolGeneratePollard(subTreeLeaves, depthPerRound, subIndex);
                        await daoProtocolSubmitRoot(propId, subRootIndex, pollard, { from: proposer });

                        // Phase 2
                        for (const index of phase2Indices) {
                            // Challenge
                            let subIndex = getSubIndex(index, subTreeLeaves);
                            const challenge = daoProtocolGenerateChallengeProof(subTreeLeaves, depthPerRound, subIndex);
                            await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });
                            // Response
                            let pollard = await daoProtocolGeneratePollard(subTreeLeaves, depthPerRound, subIndex);
                            await daoProtocolSubmitRoot(propId, index, pollard, { from: proposer });
                        }
                    });

                    it(printTitle('proposer', 'can not respond to a challenge after proposal enters voting'), async () => {
                        // Challenge/response
                        const {
                            phase1Indices,
                            subRootIndex,
                            phase2Indices,
                        } = getChallengeIndices(2 ** maxDepth, leaves.length);

                        // Challenge
                        let index = phase1Indices[0];
                        const challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                        // Let proposal enter voting
                        await helpers.time.increase(voteDelayTime + 1);

                        // Response
                        let pollard = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                        await shouldRevert(daoProtocolSubmitRoot(propId, index, pollard, { from: proposer }), 'Was able to submit root', 'Can not submit root for a valid proposal');
                    });

                    it(printTitle('proposer', 'can successfully claim proposal bond'), async () => {
                        // Wait for proposal wait period to end
                        await helpers.time.increase(voteDelayTime + 1);

                        // Let the proposal expire to unlock the bond
                        await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                        // Claim bond
                        const deltas = await daoProtocolClaimBondProposer(propId, [1], { from: proposer });
                        assertBN.equal(deltas.locked, -proposalBond);
                        assertBN.equal(deltas.staked, 0n);
                        assertBN.equal(deltas.burned, 0n);
                    });

                    it(printTitle('proposer', 'can successfully claim invalid challenge'), async () => {
                        // Create some challenges
                        const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices.slice(0, 1);
                        for (const index of indices) {
                            // Challenge
                            const challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                            await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });
                            // Response
                            let pollard = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                            await daoProtocolSubmitRoot(propId, index, pollard, { from: proposer });
                        }

                        // Wait for proposal wait period to end
                        await helpers.time.increase(voteDelayTime + 1);

                        // Let the proposal expire to unlock the bond
                        await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                        // Claim bond and rewards
                        const deltas = await daoProtocolClaimBondProposer(propId, [1, ...indices], { from: proposer });
                        assertBN.equal(deltas.locked, -proposalBond);
                        assertBN.equal(deltas.staked, bondAfterBurn(challengeBond) * (indices.length.toString().BN));
                        assertBN.equal(deltas.burned, burnAmount(challengeBond) * (indices.length.toString().BN));
                    });

                    it(printTitle('proposer', 'can not create proposal without enough RPL stake'), async () => {
                        // Not enough bond to create a second
                        await shouldRevert(createValidProposal(), 'Was able to create proposal', 'Not enough staked RPL');
                    });

                    it(printTitle('challenger', 'can not create challenge with proof from a deeper index'), async () => {
                        const {
                            phase1Indices,
                            subRootIndex,
                            phase2Indices,
                        } = getChallengeIndices(2 ** maxDepth, leaves.length);
                        const index = phase1Indices[0];
                        const proofIndex = phase1Indices[1];

                        // Create challenge using lower index
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, proofIndex);

                        // Proof length should be invalid
                        await shouldRevert(daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger }), 'Challenge was submitted', 'Invalid proof length');
                    });

                    it(printTitle('challenger', 'can recover bond if proposal was successful'), async () => {
                        // Challenge/response
                        const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                        const index = indices[0];

                        // Challenge
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                        // Wait for proposal wait period to end
                        await helpers.time.increase(voteDelayTime + 1);

                        // Let the proposal expire to unlock the bond
                        await helpers.time.increase(votePhase1Time + votePhase2Time + 1);

                        // Claim bond on invalid index
                        const deltas = await daoProtocolClaimBondChallenger(propId, [index], { from: challenger });

                        assertBN.equal(deltas.locked, -challengeBond);
                        assertBN.equal(deltas.staked, 0n);
                        assertBN.equal(deltas.burned, 0n);
                    });

                    it(printTitle('challenger', 'can not claim bond on index twice'), async () => {
                        // Challenge/response
                        const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                        const index = indices[0];
                        // Challenge
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                        // Let the challenge expire
                        await helpers.time.increase(challengePeriod + 1);

                        // Defeat it
                        await daoProtocolDefeatProposal(propId, index, { from: challenger });

                        // Claim bond on invalid index
                        await daoProtocolClaimBondChallenger(propId, [indices[0]], { from: challenger });

                        // Try claim again
                        await shouldRevert(daoProtocolClaimBondChallenger(propId, [indices[0]], { from: challenger }), 'Claimed twice', 'Invalid challenge state');
                    });

                    it(printTitle('challenger', 'can not challenge an index with greater depth than max'), async () => {
                        // Challenge/response
                        const badIndex = 2 ** (maxDepth + 1);

                        // Challenge
                        await shouldRevert(daoProtocolCreateChallenge(propId, badIndex, leaves[0], [], { from: challenger }), 'Was able to challenge invalid index', 'Invalid index depth');
                    });

                    it(printTitle('challenger', 'can not defeat a proposal before challenge period passes'), async () => {
                        // Challenge/response
                        const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                        const index = indices[0];

                        // Challenge
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                        // Defeat it
                        await shouldRevert(daoProtocolDefeatProposal(propId, index, { from: challenger }), 'Was able to claim before period', 'Not enough time has passed');
                    });

                    it(printTitle('challenger', 'can not defeat a proposal once in Active state'), async () => {
                        // Challenge/response
                        const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                        const index = indices[0];

                        // Challenge
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                        // Let the challenge pass
                        await helpers.time.increase(voteDelayTime + 1);

                        // Defeat it
                        await shouldRevert(daoProtocolDefeatProposal(propId, index, { from: challenger }), 'Was able to defeat successful proposal', 'Can not defeat a valid proposal');
                    });

                    it(printTitle('challenger', 'can not claim bond while proposal is pending'), async () => {
                        // Challenge/response
                        const {
                            phase1Indices,
                            subRootIndex,
                            phase2Indices,
                        } = getChallengeIndices(2 ** maxDepth, leaves.length);
                        const index = phase1Indices[0];

                        // Challenge
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                        // Try to claim challenge bond
                        await shouldRevert(daoProtocolClaimBondChallenger(propId, [index], { from: challenger }), 'Claimed while pending', 'Can not claim bond while proposal is Pending');
                    });

                    it(printTitle('challenger', 'can not challenge the same index twice'), async () => {
                        // Challenge/response
                        const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;
                        const index = indices[0];

                        // Challenge
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });
                        await shouldRevert(daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger }), 'Was able to challenge an index twice', 'Index already challenged');
                    });

                    it(printTitle('challenger', 'can not challenge an index with an unchallenged parent'), async () => {
                        // Challenge/response
                        const index = getChallengeIndices(2 ** maxDepth, leaves.length).subRootIndex;

                        // Challenge
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await shouldRevert(daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger }), 'Was able to challenge invalid index', 'Invalid challenge depth');
                    });

                    it(printTitle('challenger', 'can not challenge a defeated proposal'), async () => {
                        const {
                            phase1Indices,
                            subRootIndex,
                            phase2Indices,
                        } = getChallengeIndices(2 ** maxDepth, leaves.length);
                        const index = phase1Indices[0];

                        // Challenge
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                        // Let the challenge expire
                        await helpers.time.increase(challengePeriod + 1);

                        // // Defeat it
                        await daoProtocolDefeatProposal(propId, index, { from: challenger });

                        // Try challenge the next node
                        challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index + 1);
                        await shouldRevert(daoProtocolCreateChallenge(propId, index + 1, challenge.node, challenge.proof, { from: challenger }), 'Was able to challenge', 'Can only challenge while proposal is Pending');
                    });

                    it(printTitle('challenger', 'can not challenge after pending state'), async () => {
                        const {
                            phase1Indices,
                            subRootIndex,
                            phase2Indices,
                        } = getChallengeIndices(2 ** maxDepth, leaves.length);
                        const index = phase1Indices[0];

                        // Let the challenge expire
                        await helpers.time.increase(voteDelayTime + 1);

                        // Challenge
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await shouldRevert(daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger }), 'Was able to challenge', 'Can only challenge while proposal is Pending');
                    });

                    it(printTitle('challenger', 'can not claim bond on invalid index'), async () => {
                        // Challenge/response
                        const challengeIndices = getChallengeIndices(2 ** maxDepth, leaves.length);
                        const index = challengeIndices.phase1Indices[0];
                        // Challenge
                        let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
                        await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

                        // Let the challenge expire
                        await helpers.time.increase(challengePeriod + 1);

                        // Defeat it
                        await daoProtocolDefeatProposal(propId, index, { from: challenger });

                        // Claim bond on invalid index
                        await shouldRevert(daoProtocolClaimBondChallenger(propId, [challengeIndices.phase2Indices[0]], { from: proposer }), 'Claimed invalid index', 'Invalid challenge state');

                        // Try to claim proposal bond
                        await shouldRevert(daoProtocolClaimBondChallenger(propId, [1], { from: proposer }), 'Claimed proposal bond', 'Invalid challenger');
                    });
                });
            });
        });

        describe('With allow listed controller', () => {
            before(async () => {
                await setDAOProtocolBootstrapSettingAddressList(RocketDAOProtocolSettingsNetwork, "network.allow.listed.controllers", [allowListed.address], { from: owner })
            });

            it(printTitle('random', 'fails to update UARS parameters when not on allow list'), async () => {
                await shouldRevert(setDaoProtocolNodeShareSecurityCouncilAdder('0.005'.ether, {
                    from: random,
                }), 'Was able to update node share security council adder', 'Not on allow list');
                await shouldRevert(setDaoProtocolNodeCommissionShare('0.15'.ether, {
                    from: random,
                }), 'Was able to update node commission share', 'Not on allow list');
                await shouldRevert(setDaoProtocolVoterShare('0.15'.ether, {
                    from: random,
                }), 'Was able to update voter share', 'Not on allow list');
            });

            it(printTitle('allow listed', 'can update node share security council adder if on allow list'), async () => {
                await setDaoProtocolNodeShareSecurityCouncilAdder('0.005'.ether, { from: allowListed });
            });

            it(printTitle('allow listed', 'fails to update UARS parameter if removed from allow list'), async () => {
                await setDAOProtocolBootstrapSettingAddressList(RocketDAOProtocolSettingsNetwork, "network.allow.listed.controllers", [], { from: owner })
                await shouldRevert(setDaoProtocolNodeShareSecurityCouncilAdder('0.005'.ether, {
                    from: allowListed,
                }), 'Was able to update node share security council adder', 'Not on allow list');
            });

            it(printTitle('allow listed', 'fails to set node share security council adder higher than max'), async () => {
                const rocketDAOProtocolSettingsNetwork = await RocketDAOProtocolSettingsNetwork.deployed()
                const maximum = await rocketDAOProtocolSettingsNetwork.getMaxNodeShareSecurityCouncilAdder();

                // Set to max works
                await setDaoProtocolNodeShareSecurityCouncilAdder(maximum, { from: allowListed });

                // Set greater than max fails
                await shouldRevert(setDaoProtocolNodeShareSecurityCouncilAdder(maximum + '0.00001'.ether, {
                    from: allowListed,
                }), 'Was able to update node share security council adder greater than max', 'Value must be <= max value');
            });

            it(printTitle('allow listed', 'fails to set voter share + node share > 100%'), async () => {
                await setDAOProtocolBootstrapSettingAddressList(RocketDAOProtocolSettingsNetwork, "network.allow.listed.controllers", [allowListed.address], { from: owner })

                // Set voter and node to 50%
                await setDaoProtocolNodeCommissionShare('0.5'.ether, { from: allowListed });
                await setDaoProtocolVoterShare('0.5'.ether, { from: allowListed });

                // Fail to then set node to 51%
                await shouldRevert(setDaoProtocolNodeCommissionShare('0.51'.ether, {
                    from: allowListed,
                }), 'Was able to set rETH commission grater than 100%', 'rETH Commission must be <= 100%');
            });

            it(printTitle('allow listed', 'can update node commission share if on allow list'), async () => {
                await setDAOProtocolBootstrapSettingAddressList(RocketDAOProtocolSettingsNetwork, "network.allow.listed.controllers", [allowListed.address], { from: owner })
                await setDaoProtocolNodeCommissionShare('0.10'.ether, { from: allowListed });
            });

            it(printTitle('allow listed', 'can update voter share if on allow list'), async () => {
                await setDAOProtocolBootstrapSettingAddressList(RocketDAOProtocolSettingsNetwork, "network.allow.listed.controllers", [allowListed.address], { from: owner })
                await setDaoProtocolVoterShare('0.20'.ether, { from: allowListed });
            });
        })
    });
}
