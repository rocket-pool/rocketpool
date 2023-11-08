import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    setDaoProtocolBootstrapModeDisabled, setDAOProtocolBootstrapSecurityInvite,
    setDAOProtocolBootstrapSetting,
    setDAOProtocolBootstrapSettingMulti,
} from './scenario-dao-protocol-bootstrap';

// Contracts
import {
    RocketDAOProtocolSettingsAuction,
    RocketDAOProtocolSettingsDeposit,
    RocketDAOProtocolSettingsInflation,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsProposals,
    RocketDAOProtocolSettingsRewards, RocketDAOProtocolSettingsRewardsNew,
} from '../_utils/artifacts';
import {
    cloneLeaves,
    constructTreeLeaves,
    daoProtocolClaimBondChallenger,
    daoProtocolClaimBondProposer,
    daoProtocolCreateChallenge,
    daoProtocolDefeatProposal, daoProtocolExecute, daoProtocolGenerateChallengeProof,
    daoProtocolGeneratePollard, daoProtocolGenerateVoteProof,
    daoProtocolPropose,
    daoProtocolSubmitRoot, daoProtocolVote,
    getDelegatedVotingPower, getPhase2VotingPower, getSubIndex,
} from './scenario-dao-protocol';
import { getNodeCount, nodeStakeRPL, nodeWithdrawRPL, registerNode, setRPLLockingAllowed } from '../_helpers/node';
import { createMinipool, getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import {
    getDaoProtocolChallengeBond,
    getDaoProtocolChallengePeriod,
    getDaoProtocolDepthPerRound,
    getDaoProtocolProposalBond,
    getDaoProtocolVoteDelayTime, getDaoProtocolVotePhase1Time, getDaoProtocolVotePhase2Time, getDaoProtocolVoteTime,
} from '../_helpers/dao';
import { increaseTime } from '../_utils/evm';
import { assertBN } from '../_helpers/bn';
import { daoSecurityMemberJoin, getDAOSecurityMemberIsValid } from './scenario-dao-security';
import { upgradeOneDotThree } from '../_utils/upgrade';
import { voteStates } from './scenario-dao-proposal';

export default function() {
    contract.only('RocketDAOProtocol', async (accounts) => {

        // Accounts
        const [
            owner,
            random,
            proposer,
            node1,
            node2,
            securityMember1
        ] = accounts;

        let depthPerRound;
        let challengeBond;
        let proposalBond;
        let challengePeriod;
        let voteDelayTime;
        let votePhase1Time;
        let votePhase2Time;

        let nodeMap = {};

        const secondsPerEpoch = 384;
        let rewardClaimBalanceIntervals = 28;
        let balanceSubmissionFrequency = (24 * 60 * 60);
        let rewardClaimPeriodTime = (rewardClaimBalanceIntervals * balanceSubmissionFrequency * secondsPerEpoch); // 28 days

        // Setup
        before(async () => {
            // Upgrade to Houston
            await upgradeOneDotThree();

            // Add some ETH into the DP
            await userDeposit({ from: random, value: '320'.ether });

            // Store depth per round
            depthPerRound = await getDaoProtocolDepthPerRound();

            challengeBond = await getDaoProtocolChallengeBond();
            proposalBond = await getDaoProtocolProposalBond();
            challengePeriod = await getDaoProtocolChallengePeriod();
            voteDelayTime = await getDaoProtocolVoteDelayTime();
            votePhase1Time = await getDaoProtocolVotePhase1Time();
            votePhase2Time = await getDaoProtocolVotePhase2Time();

            // Set the reward claim period
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.balances.frequency', balanceSubmissionFrequency, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rewards.claimsperiods', rewardClaimBalanceIntervals, {from: owner});
        });

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
                    web3.utils.toWei('2'),
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
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.minimum', web3.utils.toWei('2'), {
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
                    web3.utils.toWei('2'),
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
                    web3.utils.toWei('2'),
                    400,
                ],
                {
                    from: owner,
                });
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
                    web3.utils.toWei('2'),
                    400,
                ],
                {
                    from: owner,
                }), 'Guardian updated bootstrap setting after mode disabled', 'Bootstrap mode not engaged');

        });

        async function createNode(minipoolCount, node) {
            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(minipoolCount.BN);
            const nodeCount = (await getNodeCount()).toNumber();
            await registerNode({ from: node });
            nodeMap[node] = nodeCount;
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, { from: node });
            await createMinipool({ from: node, value: '16'.ether });
            // Allow RPL locking by default
            await setRPLLockingAllowed(node, true, {from: node});
        }

        async function createValidProposal(name = 'Test proposal', payload = '0x0') {
            // Setup
            const block = await hre.web3.eth.getBlockNumber();
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
            for (let i = 10; i < 20; i++) {
                // Create pseudo-random number of minpools
                const count = ((i * 7) % 5) + 1;
                await createNode(count, accounts[i]);
            }
        }

        async function voteAll(proposalId, leaves, direction) {
            // Vote from each account until the proposal passes
            for (let i = 10; i < 20; i++) {
                const nodeIndex = nodeMap[accounts[i]];
                const voteProof = daoProtocolGenerateVoteProof(leaves, nodeIndex);

                try {
                    await daoProtocolVote(proposalId, direction, voteProof.sum, nodeIndex, voteProof.witness, {from: accounts[i]});
                } catch(e) {
                    if (e.message.indexOf("Proposal has passed") !== -1) {
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


        it(printTitle('proposer', 'can successfully submit a proposal'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a valid proposal
            await createValidProposal();
        });

        it(printTitle('proposer', 'can not submit a proposal if locking is not allowed'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);
            await setRPLLockingAllowed(proposer, false, {from: proposer});

            // Create a valid proposal
            await shouldRevert(createValidProposal(), 'Was able to create proposal', 'Node is not allowed to lock RPL');
        });

        it(printTitle('proposer', 'can successfully refute an invalid challenge'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId, leaves, block } = await createValidProposal();

            // Challenge/response
            const phase1Depth = getMaxDepth(leaves.length);
            const maxDepth = phase1Depth * 2;
            const { phase1Indices, subRootIndex, phase2Indices } = getChallengeIndices(2 ** maxDepth, leaves.length);

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

            // Generate the sub tree
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

        it(printTitle('proposer', 'can successfully claim proposal bond'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId } = await createValidProposal();

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Let the proposal expire to unlock the bond
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Claim bond
            const deltas = await daoProtocolClaimBondProposer(propId, [1], { from: proposer });
            assertBN.equal(deltas.locked, proposalBond.neg());
            assertBN.equal(deltas.staked, '0'.BN);
        });

        it(printTitle('proposer', 'can successfully claim invalid challenge'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId, leaves } = await createValidProposal();

            // Create some challenges
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

                // // Challenge
                // await daoProtocolCreateChallenge(propId, index, { from: challenger });
                // // Response
                // let response = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                // await daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, { from: proposer });
            }

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Let the proposal expire to unlock the bond
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Claim bond and rewards
            const deltas = await daoProtocolClaimBondProposer(propId, [1, ...indices], { from: proposer });
            assertBN.equal(deltas.locked, proposalBond.neg());
            assertBN.equal(deltas.staked, challengeBond.mul(indices.length.toString().BN));
        });

        it(printTitle('proposer', 'can not withdraw excess RPL if it is locked'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Give the proposer 150% collateral + proposal bond + 50
            await mintRPL(owner, proposer, '2390'.ether);
            await nodeStakeRPL('2390'.ether, { from: proposer });

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            await createValidProposal();

            // Wait for withdraw cooldown
            await increaseTime(hre.web3, Math.max(voteDelayTime, rewardClaimPeriodTime) + 1);

            // Let the proposal expire to unlock the bond
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Try to withdraw the 100 RPL bond (below 150% after lock)
            await shouldRevert(nodeWithdrawRPL(proposalBond, { from: proposer }), 'Was able to withdraw', 'Node\'s staked RPL balance after withdrawal is less than required balance');

            // Try to withdraw the additional 50 RPL (still above 150% after lock)
            await nodeWithdrawRPL('50'.ether, { from: proposer });
        });

        it(printTitle('proposer', 'can withdraw excess RPL after it is unlocked'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Give the proposer 150% collateral + proposal bond + 50
            await mintRPL(owner, proposer, '2390'.ether);
            await nodeStakeRPL('2390'.ether, { from: proposer });

            // Create a valid proposal
            const { propId } = await createValidProposal();

            // Wait for withdraw cooldown
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Let the proposal expire to unlock the bond
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Claim bond
            await daoProtocolClaimBondProposer(propId, [1], { from: proposer });

            // Wait the withdrawal cooldown time
            await increaseTime(hre.web3, rewardClaimPeriodTime + 1);

            // Withdraw excess
            await nodeWithdrawRPL('150'.ether, { from: proposer });
        });

        it(printTitle('proposer', 'can not create proposal without enough RPL stake'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a proposal to lock RPL
            await createValidProposal();

            // Not enough bond to create a second
            await shouldRevert(createValidProposal(), 'Was able to create proposal', 'Not enough staked RPL');
        });

        it(printTitle('proposer', 'can not create proposal with invalid leaf count'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Try to create invalid proposal
            const block = await hre.web3.eth.getBlockNumber();
            const power = await getDelegatedVotingPower(block);
            const leaves = constructTreeLeaves(power);

            // Too few
            let invalidLeaves = leaves.slice(0, 1);
            await shouldRevert(daoProtocolPropose('Test proposal', '0x0', block, invalidLeaves, { from: proposer }), 'Was able to create proposal', 'Invalid node count');

            // Too many
            invalidLeaves = [...leaves, ...leaves];
            await shouldRevert(daoProtocolPropose('Test proposal', '0x0', block, invalidLeaves, { from: proposer }), 'Was able to create proposal', 'Invalid node count');
        });

        it(printTitle('proposer', 'can not claim bond on defeated proposal'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, { from: challenger });

            // Try to claim bond
            await shouldRevert(daoProtocolClaimBondProposer(propId, [1], { from: proposer }), 'Was able to claim bond', 'Proposal defeated');
        });

        it(printTitle('proposer', 'can not claim bond twice'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId } = await createValidProposal();

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Let the proposal expire to unlock the bond
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Claim bond
            await daoProtocolClaimBondProposer(propId, [1], { from: proposer });

            // Try claim bond again
            await shouldRevert(daoProtocolClaimBondProposer(propId, [1], { from: proposer }), 'Claimed bond twice', 'Invalid challenge state');
        });

        it(printTitle('proposer', 'can not claim reward twice'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Let the proposal expire to unlock the bond
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Claim bond and rewards
            await daoProtocolClaimBondProposer(propId, [1, ...indices], { from: proposer });

            // Try claim reward again
            await shouldRevert(daoProtocolClaimBondProposer(propId, [indices[0]], { from: proposer }), 'Claimed reward twice', 'Invalid challenge state');
        });

        it(printTitle('proposer', 'can not claim reward for unresponded index'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Let the proposal expire to unlock the bond
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Try to claim reward for unresponded index
            await shouldRevert(daoProtocolClaimBondProposer(propId, [indices[0]], { from: proposer }), 'Was able to claim reward', 'Invalid challenge state');
        });

        it(printTitle('proposer', 'can not claim reward for unchallenged index'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId } = await createValidProposal();

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Let the proposal expire to unlock the bond
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Try to claim reward for unchallenged index
            await shouldRevert(daoProtocolClaimBondProposer(propId, [2], { from: proposer }), 'Was able to claim reward', 'Invalid challenge state');
        });

        it(printTitle('proposer', 'can not respond to a challenge with an invalid pollard'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            invalidNodes[0].sum = invalidNodes[0].sum.add('1'.BN);
            await shouldRevert(daoProtocolSubmitRoot(propId, index, invalidNodes, { from: proposer }), 'Accepted invalid nodes', 'Invalid sum');

            // Try with an invalid nodes (invalid node hash)
            invalidNodes = cloneLeaves(pollard);
            invalidNodes[0].hash = '0x'.padEnd(66, '0');
            await shouldRevert(daoProtocolSubmitRoot(propId, index, invalidNodes, { from: proposer }), 'Accepted invalid nodes', 'Invalid hash');
        });

        it(printTitle('proposer', 'can not respond to a challenge with an invalid leaves'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create an invalid proposal
            const block = await hre.web3.eth.getBlockNumber();
            let power = await getDelegatedVotingPower(block);
            power[0] = '1000'.ether;
            const leaves = constructTreeLeaves(power);

            // Create the proposal
            let nodes = await daoProtocolGeneratePollard(leaves, depthPerRound);
            let propId = await daoProtocolPropose('Test proposal', '0x0', block, nodes, { from: proposer });

            // Challenge/response
            const phase1Depth = getMaxDepth(leaves.length);
            const maxDepth = phase1Depth * 2;
            const { phase1Indices, subRootIndex, phase2Indices } = getChallengeIndices(2 ** maxDepth, leaves.length);

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
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create an invalid proposal
            const block = await hre.web3.eth.getBlockNumber();
            let power = await getDelegatedVotingPower(block);
            let leaves = constructTreeLeaves(power);
            leaves[0].sum = leaves[0].sum.add('100000'.BN);

            // Create the proposal
            let nodes = await daoProtocolGeneratePollard(leaves, depthPerRound);
            let propId = await daoProtocolPropose('Test proposal', '0x0', block, nodes, { from: proposer });

            // Challenge/response
            const phase1Depth = getMaxDepth(leaves.length);
            const maxDepth = phase1Depth * 2;
            const { phase1Indices, subRootIndex, phase2Indices } = getChallengeIndices(2 ** maxDepth, leaves.length);

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
            const subTreePower = await getPhase2VotingPower(block, challengedNodeId);
            let subTreeLeaves = await constructTreeLeaves(subTreePower);
            subTreeLeaves[0].sum = subTreeLeaves[0].sum.add('100000'.BN);

            let subIndex = getSubIndex(subRootIndex, subTreeLeaves);
            let pollard = await daoProtocolGeneratePollard(subTreeLeaves, depthPerRound, subIndex);
            await shouldRevert(daoProtocolSubmitRoot(propId, subRootIndex, pollard, { from: proposer }), 'Accepted invalid hash', 'Invalid hash');
        });

        /**
         * Successful Proposals
         */

        it(printTitle('proposer', 'can invite a security council member'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Invite security council member
            let proposalCalldata = hre.web3.eth.abi.encodeFunctionCall(
                {name: 'proposalSecurityInvite', type: 'function', inputs: [{type: 'string', name: '_id'}, {type: 'address', name: '_nodeAddress'}]},
                ['Security Member 1', securityMember1]
            );

            // Create a valid proposal
            const { propId, leaves } = await createValidProposal('Invite security member to the council', proposalCalldata);

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Vote all in favour
            await voteAll(propId, leaves, voteStates.For);

            // Skip the full vote period
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Execute the proposal
            await daoProtocolExecute(propId, {from: proposer});

            // Accept the invitation
            await daoSecurityMemberJoin({from: securityMember1});
        });


        it(printTitle('proposer', 'can kick a security council member'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);
            await setDAOProtocolBootstrapSecurityInvite("Member", securityMember1, {from: owner});
            await daoSecurityMemberJoin({from: securityMember1});

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Invite security council member
            let proposalCalldata = hre.web3.eth.abi.encodeFunctionCall(
                {name: 'proposalSecurityKick', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}]},
                [securityMember1]
            );

            // Create a valid proposal
            const { propId, leaves } = await createValidProposal('Kick security member from the council', proposalCalldata);

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Vote all in favour
            await voteAll(propId, leaves, voteStates.For);

            // Skip the full vote period
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Execute the proposal
            await daoProtocolExecute(propId, {from: proposer});

            // Member should no longer exists
            assert(!await getDAOSecurityMemberIsValid(securityMember1), 'Member still exists in council');
        });

        /**
         * Challenger
         */

        it(printTitle('challenger', 'can not challenge with insufficient RPL'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);
            await setRPLLockingAllowed(challenger, false, {from: challenger});

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

        it(printTitle('challenger', 'can not challenge the same index twice'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
            await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });
            await shouldRevert(daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger }), 'Was able to challenge an index twice', 'Index already challenged');
        });

        it(printTitle('challenger', 'can not challenge an index with an unchallenged parent'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId, leaves } = await createValidProposal();

            // Challenge/response
            const phase1Depth = getMaxDepth(leaves.length);
            const maxDepth = phase1Depth * 2;
            const index = getChallengeIndices(2 ** maxDepth, leaves.length).subRootIndex;

            // Challenge
            let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
            await shouldRevert(daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger }), 'Was able to challenge invalid index', 'Invalid challenge depth');
        });

        it(printTitle('challenger', 'can not challenge an index with greater depth than max'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId, leaves } = await createValidProposal();

            // Challenge/response
            const phase1Depth = getMaxDepth(leaves.length);
            const maxDepth = phase1Depth * 2;
            const badIndex = 2 ** (maxDepth + 1);

            // Challenge
            // let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
            await shouldRevert(daoProtocolCreateChallenge(propId, badIndex, leaves[0], [], { from: challenger }), 'Was able to challenge invalid index', 'Invalid index depth');
        });

        it(printTitle('challenger', 'can not defeat a proposal before challenge period passes'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
            await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

            // Defeat it
            await shouldRevert(daoProtocolDefeatProposal(propId, index, { from: challenger }), 'Was able to claim before period', 'Not enough time has passed');
        });

        it(printTitle('challenger', 'can not challenge a defeated proposal'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId, leaves } = await createValidProposal();

            const index = 2;

            // Challenge
            let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
            await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

            // Let the challenge expire
            await increaseTime(hre.web3, challengePeriod + 1);

            // // Defeat it
            await daoProtocolDefeatProposal(propId, index, { from: challenger });

            // Try challenge the next node
            challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index + 1);
            await shouldRevert(daoProtocolCreateChallenge(propId, index + 1, challenge.node, challenge.proof, { from: challenger }), 'Was able to challenge', 'Proposal already defeated');
        });

        it(printTitle('challenger', 'can not claim bond on invalid index'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId, leaves } = await createValidProposal();

            // Challenge/response
            const phase1Depth = getMaxDepth(leaves.length);
            const maxDepth = phase1Depth * 2;
            const challengeIndices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = challengeIndices.phase1Indices[0];
            // Challenge
            let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
            await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

            // Let the challenge expire
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, { from: challenger });

            // Claim bond on invalid index
            await shouldRevert(daoProtocolClaimBondChallenger(propId, [challengeIndices.phase2Indices[0]], { from: proposer }), 'Claimed invalid index', 'Invalid challenge state');

            // Try to claim proposal bond
            await shouldRevert(daoProtocolClaimBondChallenger(propId, [1], { from: proposer }), 'Claimed proposal bond', 'Invalid challenger');
        });

        it(printTitle('challenger', 'can not claim bond on index twice'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
            await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

            // Let the challenge expire
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, { from: challenger });

            // Claim bond on invalid index
            await daoProtocolClaimBondChallenger(propId, [indices[0]], { from: challenger });

            // Try claim again
            await shouldRevert(daoProtocolClaimBondChallenger(propId, [indices[0]], { from: challenger }), 'Claimed twice', 'Invalid challenge state');
        });

        it(printTitle('challenger', 'can claim share on defeated proposal'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length).phase1Indices;

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
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, indices[1], { from: challenger2 });

            // Claim bond on invalid index
            const deltas1 = await daoProtocolClaimBondChallenger(propId, [indices[0]], { from: challenger1 });
            const deltas2 = await daoProtocolClaimBondChallenger(propId, [indices[1]], { from: challenger2 });

            // Each should receive 1/2 of the proposal bond as a reward and their challenge bond back
            assertBN.equal(deltas1.staked, proposalBond.div('2'.BN));
            assertBN.equal(deltas2.staked, proposalBond.div('2'.BN));
            assertBN.equal(deltas1.locked, challengeBond.neg());
            assertBN.equal(deltas2.locked, challengeBond.neg());
        });

        it(printTitle('challenger', 'can recover bond if index was not used'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, { from: challenger1 });

            // Recover bond
            const deltas1 = await daoProtocolClaimBondChallenger(propId, [index], { from: challenger1 });
            const deltas2 = await daoProtocolClaimBondChallenger(propId, [index + 1], { from: challenger2 });

            assertBN.equal(deltas1.locked, challengeBond.neg());
            assertBN.equal(deltas1.staked, proposalBond);
            assertBN.equal(deltas2.locked, challengeBond.neg());
            assertBN.equal(deltas2.staked, '0'.BN);
        });

        it(printTitle('challenger', 'can recover bond if proposal was successful'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            let challenge = daoProtocolGenerateChallengeProof(leaves, depthPerRound, index);
            await daoProtocolCreateChallenge(propId, index, challenge.node, challenge.proof, { from: challenger });

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Let the proposal expire to unlock the bond
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Claim bond on invalid index
            const deltas = await daoProtocolClaimBondChallenger(propId, [index], { from: challenger });

            assertBN.equal(deltas.locked, challengeBond.neg());
            assertBN.equal(deltas.staked, '0'.BN);
        });

        /**
         * Other
         */

        it(printTitle('other', 'can not claim reward on challenge they did not make'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

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
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, { from: challenger });

            // Claim bond on invalid index
            await shouldRevert(daoProtocolClaimBondChallenger(propId, [indices[0]], { from: node2 }), 'Was able to claim reward', 'Invalid challenger');
        });

        it(printTitle('other', 'can not claim bond on a proposal they did not make'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create node for invalid claim
            await createNode(1, node2);

            // Create a valid proposal
            const { propId } = await createValidProposal();

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Let the proposal expire to unlock the bond
            await increaseTime(hre.web3, votePhase1Time + votePhase2Time + 1);

            // Claim bond on invalid index
            await shouldRevert(daoProtocolClaimBondProposer(propId, [1], { from: node2 }), 'Was able to claim proposal bond', 'Not proposer');
        });
    });
}

