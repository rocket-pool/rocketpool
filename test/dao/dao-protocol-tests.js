import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
  setDAOProtocolBootstrapSetting,
  setDaoProtocolBootstrapModeDisabled,
  setDAOProtocolBootstrapSettingMulti
} from './scenario-dao-protocol-bootstrap'

// Contracts
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
    constructLeaves,
    daoProtocolSubmitRoot,
    daoProtocolCreateChallenge,
    daoProtocolDefeatProposal,
    daoProtocolGeneratePollard,
    daoProtocolPropose,
    getDelegatedVotingPower,
    daoProtocolClaimBondProposer, daoProtocolClaimBondChallenger,
} from './scenario-dao-protocol';
import { nodeStakeRPL, nodeWithdrawRPL, registerNode } from '../_helpers/node';
import { createMinipool, getMinipoolMaximumRPLStake, getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import {
    getDaoProtocolChallengeBond,
    getDaoProtocolChallengePeriod,
    getDaoProtocolDepthPerRound,
    getDaoProtocolProposalBond, getDaoProtocolVoteDelayTime,
} from '../_helpers/dao';
import { increaseTime } from '../_utils/evm';
import { assertBN } from '../_helpers/bn';

export default function() {
    contract.only('RocketDAOProtocol', async (accounts) => {

        // Accounts
        const [
            owner,
            random,
            proposer,
            node1,
            node2,
        ] = accounts;

        let depthPerRound;
        let challengeBond;
        let proposalBond;
        let challengePeriod;
        let voteDelayTime;

        const rewardClaimPeriodTime = 60 * 60 * 24;

        // Setup - This is a WIP DAO, onlyGuardians will be able to change settings before the DAO is officially rolled out
        before(async () => {
            // Add some ETH into the DP
            await userDeposit({ from: random, value: '320'.ether, });

            // Store depth per round
            depthPerRound = await getDaoProtocolDepthPerRound();

            challengeBond = await getDaoProtocolChallengeBond();
            proposalBond = await getDaoProtocolProposalBond();
            challengePeriod = await getDaoProtocolChallengePeriod();
            voteDelayTime = await getDaoProtocolVoteDelayTime();

            // Set the reward claim period
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rpl.rewards.claim.period.time', rewardClaimPeriodTime, {from: owner});
        });


        //
        // Start Tests
        //

        // Update a setting
        it(printTitle('random', 'fails to update a setting as they are not the guardian'), async () => {
            // Fails to change a setting
            await shouldRevert(setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: random,
            }), "User updated bootstrap setting", "Account is not a temporary guardian");

        });

        // Update multiple settings
        it(printTitle('random', 'fails to update multiple settings as they are not the guardian'), async () => {
          // Fails to change multiple settings
          await shouldRevert(setDAOProtocolBootstrapSettingMulti([
                RocketDAOProtocolSettingsAuction,
                RocketDAOProtocolSettingsDeposit,
                RocketDAOProtocolSettingsInflation
              ],
              [
                'auction.lot.create.enabled',
                'deposit.minimum',
                'rpl.inflation.interval.blocks'
              ],
              [
                true,
                web3.utils.toWei('2'),
                400
              ],
              {
                from: random
              }), "User updated bootstrap setting", "Account is not a temporary guardian");
        });

        // Verify each setting contract is enabled correctly. These settings are tested in greater detail in the relevent contracts
        it(printTitle('guardian', 'updates a setting in each settings contract while bootstrap mode is enabled'), async () => {
            // Set via bootstrapping
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: owner
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.minimum', web3.utils.toWei('2'), {
                from: owner
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsInflation, 'rpl.inflation.interval.blocks', 400, {
                from: owner
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.submit.withdrawable.enabled', true, {
                from: owner
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.enabled', true, {
                from: owner
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rpl.rewards.claim.period.blocks', 100, {
                from: owner
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsInflation, 'network.reth.deposit.delay', 500, {
                from: owner
            });
        });

      // Verify each setting contract is enabled correctly. These settings are tested in greater detail in the relevent contracts
      it(printTitle('guardian', 'updates multiple settings at once while bootstrap mode is enabled'), async () => {
        // Set via bootstrapping
        await setDAOProtocolBootstrapSettingMulti([
            RocketDAOProtocolSettingsAuction,
            RocketDAOProtocolSettingsDeposit,
            RocketDAOProtocolSettingsInflation
          ],
          [
            'auction.lot.create.enabled',
            'deposit.minimum',
            'rpl.inflation.interval.blocks'
          ],
          [
            true,
            web3.utils.toWei('2'),
            400
          ],
          {
          from: owner
        });
      });

      // Update a setting, then try again
      it(printTitle('guardian', 'updates a setting, then fails to update a setting again after bootstrap mode is disabled'), async () => {
            // Set via bootstrapping
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: owner
            });
            // Disable bootstrap mode
            await setDaoProtocolBootstrapModeDisabled({
                from: owner
            });
            // Attempt to change a setting again
            await shouldRevert(setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: owner,
            }), "Guardian updated bootstrap setting after mode disabled", "Bootstrap mode not engaged");

        });

        // Update multiple settings, then try again
        it(printTitle('guardian', 'updates multiple settings, then fails to update multiple settings again after bootstrap mode is disabled'), async () => {
          // Set via bootstrapping
          await setDAOProtocolBootstrapSettingMulti([
              RocketDAOProtocolSettingsAuction,
              RocketDAOProtocolSettingsDeposit,
              RocketDAOProtocolSettingsInflation
            ],
            [
              'auction.lot.create.enabled',
              'deposit.minimum',
              'rpl.inflation.interval.blocks'
            ],
            [
              true,
              web3.utils.toWei('2'),
              400
            ],
            {
              from: owner
            });
            // Disable bootstrap mode
            await setDaoProtocolBootstrapModeDisabled({
              from: owner
            });
            // Attempt to change a setting again
            await shouldRevert(setDAOProtocolBootstrapSettingMulti([
                RocketDAOProtocolSettingsAuction,
                RocketDAOProtocolSettingsDeposit,
                RocketDAOProtocolSettingsInflation
              ],
              [
                'auction.lot.create.enabled',
                'deposit.minimum',
                'rpl.inflation.interval.blocks'
              ],
              [
                true,
                web3.utils.toWei('2'),
                400
              ],
              {
                from: owner
              }), "Guardian updated bootstrap setting after mode disabled", "Bootstrap mode not engaged");

        });

        async function proposalChallengeResponse(proposer, challenger, proposerLeaves, challengerLeaves, index) {
            const block = await hre.web3.eth.getBlockNumber();
            const depthPerRound = await getDaoProtocolDepthPerRound();

            // Create the proposal
            let {nodes} = await daoProtocolGeneratePollard(proposerLeaves, depthPerRound);
            const propId = await daoProtocolPropose("Test proposal", "0x0", block, nodes, {from: proposer});

            const maxDepth = Math.ceil(Math.log2(proposerLeaves.length));
            const totalLeaves = 2 ** maxDepth;
            let rounds = Math.ceil(Math.floor(Math.log2(totalLeaves)) / depthPerRound) - 1;

            if (rounds === 0) {
                rounds = 1;
            }

            const indices = [];

            // Calculate the indices for each challenge round
            for (let i = 1; i <= rounds; i++) {
                let j = i * depthPerRound;
                if (j > maxDepth) {
                    j = maxDepth;
                }
                indices.push(index / (2 ** (maxDepth - j)));
            }
            indices.push(index);

            // Create challenge
            let challengeIndex = indices[0];
            await daoProtocolCreateChallenge(propId, challengeIndex, {from: challenger});

            for (let round = 0; round < rounds; round++){
                // Respond
                let response = await daoProtocolGeneratePollard(proposerLeaves, depthPerRound, challengeIndex);
                await daoProtocolSubmitRoot(propId, challengeIndex, response.proof, response.nodes, {from: proposer});

                let challengeDepth = Math.min(Math.ceil(Math.log2(challengeIndex)) + depthPerRound, maxDepth);

                if (challengeDepth === maxDepth) {
                    return;
                }

                // Refresh
                challengeIndex = indices[round+1];
                await daoProtocolCreateChallenge(propId, challengeIndex, {from: challenger});
            }
        }

        async function createNode(minipoolCount, node) {
            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(minipoolCount.BN);
            await registerNode({from: node});
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});
            await createMinipool({from: node, value: '16'.ether});
        }

        async function createValidProposal() {
            // Setup
            const block = await hre.web3.eth.getBlockNumber();
            const power = await getDelegatedVotingPower(block);
            const leaves = constructLeaves(power);

            // Create the proposal
            let {nodes} = await daoProtocolGeneratePollard(leaves, depthPerRound);
            let propId = await daoProtocolPropose("Test proposal", "0x0", block, nodes, {from: proposer});

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

        // Calculate the indices for each challenge round
        function getChallengeIndices(finalIndex, leafCount) {
            const maxDepth = getMaxDepth(leafCount);
            const maxRounds = getRoundCount(leafCount)
            const indices = [];
            for (let i = 1; i <= maxRounds; i++) {
                let j = i * depthPerRound;
                if (j <= maxDepth) {
                    indices.push(finalIndex / (2 ** (maxDepth - j)));
                }
            }
            if (Math.floor(Math.log2(finalIndex)) % depthPerRound !== 0) {
                indices.push(finalIndex);
            }
            return indices;
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


        it(printTitle('proposer', 'can successfully refute an invalid challenge'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId, leaves } = await createValidProposal();

            // Challenge/response
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            for (const index of indices) {
                // Challenge
                await daoProtocolCreateChallenge(propId, index, {from: challenger});
                // Response
                let response = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                await daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: proposer});
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

            // Claim bond
            const deltas = await daoProtocolClaimBondProposer(propId, [1], {from: proposer});
            assertBN.equal(deltas.locked, proposalBond.neg());
            assertBN.equal(deltas.staked, "0".BN);
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

            // Create some invalid challenges
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length).slice(0, 2);
            for (const index of indices) {
                // Challenge
                await daoProtocolCreateChallenge(propId, index, {from: challenger});
                // Response
                let response = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                await daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: proposer});
            }

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Claim bond and rewards
            const deltas = await daoProtocolClaimBondProposer(propId, [1, ...indices], {from: proposer});
            assertBN.equal(deltas.locked, proposalBond.neg());
            assertBN.equal(deltas.staked, challengeBond.mul("2".BN));
        });


        it(printTitle('proposer', 'can not withdraw excess RPL if it is locked'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Give the proposer 150% collateral + proposal bond + 50
            await mintRPL(owner, proposer, '2390'.ether);
            await nodeStakeRPL('2390'.ether, {from: proposer});

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            await createValidProposal();

            // Wait for withdraw cooldown
            await increaseTime(hre.web3, Math.max(voteDelayTime, rewardClaimPeriodTime) + 1);

            // Try to withdraw the 100 RPL bond (below 150% after lock)
            await shouldRevert(nodeWithdrawRPL(proposalBond, {from :proposer}), 'Was able to withdraw', 'Node\'s staked RPL balance after withdrawal is less than required balance');

            // Try to withdraw the additional 50 RPL (still above 150% after lock)
            await nodeWithdrawRPL('50'.ether, {from :proposer});
        });


        it(printTitle('proposer', 'can withdraw excess RPL after it is unlocked'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Give the proposer 150% collateral + proposal bond + 50
            await mintRPL(owner, proposer, '2390'.ether);
            await nodeStakeRPL('2390'.ether, {from: proposer});

            // Create a valid proposal
            const { propId } = await createValidProposal();

            // Wait for withdraw cooldown
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Claim bond
            await daoProtocolClaimBondProposer(propId, [1], {from: proposer});

            // Withdraw excess
            await nodeWithdrawRPL('150'.ether, {from :proposer});
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
            const leaves = constructLeaves(power);

            // Too few
            let invalidLeaves = leaves.slice(0, 1);
            await shouldRevert(daoProtocolPropose("Test proposal", "0x0", block, invalidLeaves, {from: proposer}), 'Was able to create proposal', 'Invalid node count')

            // Too many
            invalidLeaves = [...leaves, ...leaves];
            await shouldRevert(daoProtocolPropose("Test proposal", "0x0", block, invalidLeaves, {from: proposer}), 'Was able to create proposal', 'Invalid node count')
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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[0];
            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger});

            // Let the challenge expire
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, {from: challenger});

            // Try to claim bond
            await shouldRevert(daoProtocolClaimBondProposer(propId, [1], {from: proposer}), 'Was able to claim bond', 'Proposal defeated');
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

            // Claim bond
            await daoProtocolClaimBondProposer(propId, [1], {from: proposer});

            // Try claim bond again
            await shouldRevert(daoProtocolClaimBondProposer(propId, [1], {from: proposer}), 'Claimed bond twice', 'Invalid challenge state');
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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length).slice(0, 2);
            for (const index of indices) {
                // Challenge
                await daoProtocolCreateChallenge(propId, index, {from: challenger});
                // Response
                let response = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                await daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: proposer});
            }

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Claim bond and rewards
            await daoProtocolClaimBondProposer(propId, [1, ...indices], {from: proposer});

            // Try claim reward again
            await shouldRevert(daoProtocolClaimBondProposer(propId, [indices[0]], {from: proposer}), 'Claimed reward twice', 'Invalid challenge state');
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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length).slice(0, 2);
            const index = indices[0];
            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger});

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Try to claim reward for unresponded index
            await shouldRevert(daoProtocolClaimBondProposer(propId, [indices[0]], {from: proposer}), 'Was able to claim reward', 'Invalid challenge state');
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

            // Try to claim reward for unchallenged index
            await shouldRevert(daoProtocolClaimBondProposer(propId, [2], {from: proposer}), 'Was able to claim reward', 'Invalid challenge state');
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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[0];
            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger});

            // Response
            let response = await daoProtocolGeneratePollard(leaves, depthPerRound, index);

            // Try with an invalid witness length
            await shouldRevert(daoProtocolSubmitRoot(propId, index, response.proof.slice(0, response.proof.length - 1), response.nodes, {from: proposer}), 'Invalid witness accepted', 'Invalid witness length');

            // Try with an invalid witness (invalid sum)
            let invalidProof = response.proof.slice();
            invalidProof[0].sum = invalidProof[0].sum.add('1'.BN);
            await shouldRevert(daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: proposer}), 'Invalid witness accepted', 'Invalid proof');

            // Try with an invalid witness (invalid hash)
            invalidProof = response.proof.slice();
            invalidProof[0].hash = '0x'.padEnd(66, '0');
            await shouldRevert(daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: proposer}), 'Invalid witness accepted', 'Invalid proof');

            // Try with an invalid nodes (incorrect node count)
            await shouldRevert(daoProtocolSubmitRoot(propId, index, response.proof, response.nodes.slice(0, 1), {from: proposer}), 'Accepted invalid nodes', 'Invalid node count');

            // Try with an invalid nodes (invalid node sum)
            let invalidNodes = response.nodes.slice();
            invalidNodes[0].sum = invalidNodes[0].sum.BN.add('1'.BN).toString();
            await shouldRevert(daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: proposer}), 'Accepted invalid nodes', 'Invalid proof');

            // Try with an invalid nodes (invalid node hash)
            invalidNodes = response.nodes.slice();
            invalidNodes[0].hash = '0x'.padEnd(66, '0');
            await shouldRevert(daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: proposer}), 'Accepted invalid nodes', 'Invalid proof');
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
            power[0][0] = '1000'.ether;
            const leaves = constructLeaves(power);

            // Create the proposal
            let {nodes} = await daoProtocolGeneratePollard(leaves, depthPerRound);
            let propId = await daoProtocolPropose("Test proposal", "0x0", block, nodes, {from: proposer});

            // Challenge the invalid leaf
            const maxDepth = getMaxDepth(leaves.length);
            const invalidIndex = 2 ** maxDepth;
            const indices = getChallengeIndices(invalidIndex, leaves.length);

            // Challenge up to the final round
            for (const index of indices.slice(0, indices.length-1)) {
                // Challenge
                await daoProtocolCreateChallenge(propId, index, {from: challenger});
                // Response
                let response = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                await daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: proposer});
            }

            const finalChallengeIndex = indices[indices.length - 1];

            // Challenge final round
            await daoProtocolCreateChallenge(propId, finalChallengeIndex, {from: challenger});

            // Response
            let response = await daoProtocolGeneratePollard(leaves, depthPerRound, finalChallengeIndex);
            await shouldRevert(daoProtocolSubmitRoot(propId, finalChallengeIndex, response.proof, response.nodes, {from: proposer}), 'Accepted invalid leaves', 'Invalid leaves');
        });


        it(printTitle('proposer', 'can not respond to a challenge with an invalid leaves (invalid sum)'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create an invalid proposal
            const block = await hre.web3.eth.getBlockNumber();
            const power = await getDelegatedVotingPower(block);
            const leaves = constructLeaves(power);
            leaves[0].sum = leaves[0].sum.add('1'.BN);

            // Create the proposal
            let {nodes} = await daoProtocolGeneratePollard(leaves, depthPerRound);
            let propId = await daoProtocolPropose("Test proposal", "0x0", block, nodes, {from: proposer});

            // Challenge the invalid leaf
            const maxDepth = getMaxDepth(leaves.length);
            const invalidIndex = 2 ** maxDepth;
            const indices = getChallengeIndices(invalidIndex, leaves.length);

            // Challenge up to the final round
            for (const index of indices.slice(0, indices.length-1)) {
                // Challenge
                await daoProtocolCreateChallenge(propId, index, {from: challenger});
                // Response
                let response = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                await daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: proposer});
            }

            const finalChallengeIndex = indices[indices.length - 1];

            // Challenge final round
            await daoProtocolCreateChallenge(propId, finalChallengeIndex, {from: challenger});

            // Response
            let response = await daoProtocolGeneratePollard(leaves, depthPerRound, finalChallengeIndex);
            await shouldRevert(daoProtocolSubmitRoot(propId, finalChallengeIndex, response.proof, response.nodes, {from: proposer}), 'Accepted invalid leaves', 'Invalid leaves');
        });


        it(printTitle('proposer', 'can not respond to a challenge with an invalid leaves (invalid hash)'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create an invalid proposal
            const block = await hre.web3.eth.getBlockNumber();
            const power = await getDelegatedVotingPower(block);
            const leaves = constructLeaves(power);
            leaves[0].hash = '0x'.padEnd(66, '0');

            // Create the proposal
            let {nodes} = await daoProtocolGeneratePollard(leaves, depthPerRound);
            let propId = await daoProtocolPropose("Test proposal", "0x0", block, nodes, {from: proposer});

            // Challenge the invalid leaf
            const maxDepth = getMaxDepth(leaves.length);
            const invalidIndex = 2 ** maxDepth;
            const indices = getChallengeIndices(invalidIndex, leaves.length);

            // Challenge up to the final round
            for (const index of indices.slice(0, indices.length-1)) {
                // Challenge
                await daoProtocolCreateChallenge(propId, index, {from: challenger});
                // Response
                let response = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
                await daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: proposer});
            }

            const finalChallengeIndex = indices[indices.length - 1];

            // Challenge final round
            await daoProtocolCreateChallenge(propId, finalChallengeIndex, {from: challenger});

            // Response
            let response = await daoProtocolGeneratePollard(leaves, depthPerRound, finalChallengeIndex);
            await shouldRevert(daoProtocolSubmitRoot(propId, finalChallengeIndex, response.proof, response.nodes, {from: proposer}), 'Accepted invalid leaves', 'Invalid leaves');
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
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsProposals, "proposal.challenge.bond", '10000'.ether, {from: owner});

            // Create a valid proposal
            const { propId, leaves } = await createValidProposal();

            // Challenge/response
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[0];

            // Challenge
            await shouldRevert(daoProtocolCreateChallenge(propId, index, {from: challenger}), 'Was able to challenge', 'Not enough staked RPL');
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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[0];

            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger});
            await shouldRevert(daoProtocolCreateChallenge(propId, index, {from: challenger}), 'Was able to challenge an index twice', 'Index already challenged');
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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[indices.length - 1];

            // Challenge
            await shouldRevert(daoProtocolCreateChallenge(propId, index, {from: challenger}), 'Was able to challenge invalid index', 'Invalid challenge depth');
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
            const maxDepth = getMaxDepth(leaves.length);
            const index = 2 ** (maxDepth + 1);

            // Challenge
            await shouldRevert(daoProtocolCreateChallenge(propId, index, {from: challenger}), 'Was able to challenge invalid index', 'Invalid challenge depth');
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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[0];

            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger});

            // Defeat it
            await shouldRevert(daoProtocolDefeatProposal(propId, index, {from: challenger}), 'Was able to claim before period', 'Not enough time has passed');
        });


        it(printTitle('challenger', 'can not challenge a defeated proposal'), async () => {
            // Setup
            await mockNodeSet();
            await createNode(1, proposer);

            // Create a minipool with a node to use as a challenger
            let challenger = node1;
            await createNode(1, challenger);

            // Create a valid proposal
            const { propId } = await createValidProposal();

            const index = 2;

            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger});

            // Let the challenge expire
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, {from: challenger});

            // Try challenge the next node
            await daoProtocolCreateChallenge(propId, index + 1, {from: challenger});
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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[0];
            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger});

            // Let the challenge expire
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, {from: challenger});

            // Claim bond on invalid index
            await shouldRevert(daoProtocolClaimBondChallenger(propId, [indices[1]], {from: proposer}), 'Claimed invalid index', 'Invalid challenge state');

            // Try to claim proposal bond
            await shouldRevert(daoProtocolClaimBondChallenger(propId, [1], {from: proposer}), 'Claimed proposal bond', 'Invalid challenger');
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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[0];
            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger});

            // Let the challenge expire
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, {from: challenger});

            // Claim bond on invalid index
            await daoProtocolClaimBondChallenger(propId, [indices[0]], {from: challenger});

            // Try claim again
            await shouldRevert(daoProtocolClaimBondChallenger(propId, [indices[0]], {from: challenger}), 'Claimed twice', 'Invalid challenge state');
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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);

            // Challenge first round
            await daoProtocolCreateChallenge(propId, indices[0], {from: challenger1});

            // Response
            let response = await daoProtocolGeneratePollard(leaves, depthPerRound, indices[0]);
            await daoProtocolSubmitRoot(propId, indices[0], response.proof, response.nodes, {from: proposer});

            // Challenge second round
            await daoProtocolCreateChallenge(propId, indices[1], {from: challenger2});

            // Let the challenge expire
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, indices[1], {from: challenger2});

            // Claim bond on invalid index
            const deltas1 = await daoProtocolClaimBondChallenger(propId, [indices[0]], {from: challenger1});
            const deltas2 = await daoProtocolClaimBondChallenger(propId, [indices[1]], {from: challenger2});

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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[0];

            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger1});
            await daoProtocolCreateChallenge(propId, index+1, {from: challenger2});

            // Let the challenge expire
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, {from: challenger1});

            // Recover bond
            const deltas1 = await daoProtocolClaimBondChallenger(propId, [index], {from: challenger1});
            const deltas2 = await daoProtocolClaimBondChallenger(propId, [index+1], {from: challenger2});

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
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[0];

            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger});

            // Wait for proposal wait period to end
            await increaseTime(hre.web3, voteDelayTime + 1);

            // Claim bond on invalid index
            const deltas = await daoProtocolClaimBondChallenger(propId, [index], {from: challenger});

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

            // Create a valid proposal
            const { propId, leaves } = await createValidProposal();

            // Challenge/response
            const maxDepth = getMaxDepth(leaves.length);
            const indices = getChallengeIndices(2 ** maxDepth, leaves.length);
            const index = indices[0];
            // Challenge
            await daoProtocolCreateChallenge(propId, index, {from: challenger});

            // Let the challenge expire
            await increaseTime(hre.web3, challengePeriod + 1);

            // Defeat it
            await daoProtocolDefeatProposal(propId, index, {from: challenger});

            // Claim bond on invalid index
            await shouldRevert(daoProtocolClaimBondChallenger(propId, [indices[0]], {from: node2}), 'Was able to claim reward', 'Invalid challenger');
        });


        it(printTitle('other', 'can not claim bond on a proposal they did not make'), async () => {
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

            // Claim bond on invalid index
            await shouldRevert(daoProtocolClaimBondProposer(propId, [1], {from: node2}), 'Was able to claim proposal bond', 'Not proposer');
        });
    });
}
