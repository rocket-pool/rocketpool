import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
  setDAOProtocolBootstrapSetting,
  setDaoProtocolBootstrapModeDisabled,
  setDAOProtocolBootstrapSettingMulti
} from './scenario-dao-protocol-bootstrap'

// Contracts
import { RocketDAOProtocolSettingsAuction, RocketDAOProtocolSettingsDeposit, RocketDAOProtocolSettingsInflation, RocketDAOProtocolSettingsMinipool, RocketDAOProtocolSettingsNetwork, RocketDAOProtocolSettingsRewards } from '../_utils/artifacts';
import {
    constructLeaves,
    daoProtocolChallengeRefresh,
    daoProtocolSubmitRoot, daoProtocolClaimBondChallenger,
    daoProtocolCreateChallenge,
    daoProtocolDefeatProposal,
    daoProtocolGenerateCorrectPollard,
    daoProtocolGeneratePollard,
    daoProtocolGenerateTree,
    daoProtocolPropose,
    getDelegatedVotingPower,
    getDepthFromIndex,
    getVotingPowerLeaves,
} from './scenario-dao-protocol';
import { nodeSetDelegate, nodeStakeRPL, registerNode } from '../_helpers/node';
import { createMinipool, getMinipoolMaximumRPLStake } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import { setDelegate } from '../_helpers/network';
import { getDaoProtocolChallenge, getDaoProtocolDepthPerRound } from '../_helpers/dao';
import { increaseTime } from '../_utils/evm';

const CHALLENGE_STATE_PROPOSER = '0';
const CHALLENGE_STATE_CHALLENGER = '1';
const CHALLENGE_STATE_COMPLETE = '2';

export default function() {
    contract('RocketDAOProtocol', async (accounts) => {

        // Accounts
        const [
            owner,
            random,
            node1,
            node2,
            node3,
            node4,
            node5,
            node6,
            node7,
            node8,
            node9,
            node10,
            node11,
            node12,
        ] = accounts;


        // Setup - This is a WIP DAO, onlyGuardians will be able to change settings before the DAO is officially rolled out
        before(async () => {
            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMaximumRPLStake();
            // Add some ETH into the DP
            await userDeposit({ from: random, value: '320'.ether, });
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

        async function challengeResponse(proposer, challenger, proposerLeaves, challengerLeaves, index) {
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
            console.log(`Challenging ${index} on round 0 with index ${challengeIndex}`);
            await daoProtocolCreateChallenge(propId, challengeIndex, {from: challenger});

            for (let round = 0; round < rounds; round++){
                // Respond
                let response = await daoProtocolGeneratePollard(proposerLeaves, depthPerRound, challengeIndex);
                await daoProtocolSubmitRoot(propId, challengeIndex, response.proof, response.nodes, {from: proposer});

                let challengeDepth = Math.min(Math.ceil(Math.log2(challengeIndex)) + depthPerRound, maxDepth);

                console.log(`Challenge depth is ${challengeDepth}/${maxDepth}`);

                if (challengeDepth === maxDepth) {
                    console.log("Challenge defeated");
                    return;
                }

                // Refresh
                challengeIndex = indices[round+1];
                console.log(`Index for ${index} on round ${round+1} is ${challengeIndex}`);
                await daoProtocolCreateChallenge(propId, challengeIndex, {from: challenger});
            }
        }

        async function createNode(minipoolCount, node) {
            let rplStake = '160'.ether.mul(minipoolCount.BN);
            await registerNode({from: node});
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});
            await createMinipool({from: node, value: '16'.ether});
        }

        it(printTitle('registered node', 'can defeat a challenge'), async () => {
            await createNode(1, node1);
            await createNode(1, node2);
            await createNode(1, node3);
            await createNode(2, node4);
            await createNode(1, node5);
            await createNode(1, node6);
            await createNode(1, node7);
            await createNode(2, node8);
            await createNode(1, node9);
            await createNode(1, node10);
            await createNode(1, node11);
            await createNode(2, node12);
            await nodeSetDelegate(node1, {from: node2});
            await nodeSetDelegate(node1, {from: node3});

            const block = await hre.web3.eth.getBlockNumber();
            const power = await getDelegatedVotingPower(block);
            const leaves = constructLeaves(power);

            await challengeResponse(node1, node2, leaves, leaves, 256);
        });

        it(printTitle('registered node', 'can not defeat a valid challenge'), async () => {
            await createNode(1, node1);
            await createNode(1, node2);

            const block = await hre.web3.eth.getBlockNumber();

            // Maliciously change the voting power
            const power = await getDelegatedVotingPower(block);
            const modifiedPower = [];
            for (let i = 0; i < power.length; i++) {
                modifiedPower[i] = power[i].slice();
            }
            modifiedPower[0][0] = modifiedPower[0][0].add('16'.ether);
            const modifiedLeaves = constructLeaves(modifiedPower);
            const leaves = constructLeaves(power);

            await shouldRevert(challengeResponse(node1, node2, modifiedLeaves, leaves, 4), "Was able to perform challenge response for invalid leaves", "Invalid leaves");
        });

        it(printTitle('registered node', 'proposal example'), async () => {
            await createNode(1, node1);
            await createNode(2, node2);
            await createNode(3, node3);
            await nodeSetDelegate(node1, {from :node2});

            const block = await hre.web3.eth.getBlockNumber();

            const power = await getDelegatedVotingPower(block);
            const leaves = constructLeaves(power);

            await challengeResponse(node1, node2, leaves, leaves, 16);
        });

        it.only(printTitle('registered node', 'proposal defeat example'), async () => {
            await createNode(1, node1);
            await createNode(2, node2);
            await createNode(3, node3);
            await nodeSetDelegate(node1, {from :node2});

            const block = await hre.web3.eth.getBlockNumber();
            const power = await getDelegatedVotingPower(block);
            const leaves = constructLeaves(power);

            const depthPerRound = await getDaoProtocolDepthPerRound();

            // Create the proposal
            let {nodes} = await daoProtocolGeneratePollard(leaves, depthPerRound);
            const propId = await daoProtocolPropose("Test proposal", "0x0", block, nodes, {from: node1});

            // Challenge the proposal
            let index = 2;
            console.log(`Challenging ${index}`);
            await daoProtocolCreateChallenge(propId, index, {from: node2});

            // Respond
            console.log("Responding")
            let response = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
            await daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: node1});

            // Challenge the proposal
            index = 3;
            console.log(`Challenging ${index}`);
            await daoProtocolCreateChallenge(propId, index, {from: node4});

            // Challenge the proposal
            index = 4;
            console.log(`Challenging ${index}`);
            await daoProtocolCreateChallenge(propId, index, {from: node3});

            // Respond
            console.log("Responding")
            response = await daoProtocolGeneratePollard(leaves, depthPerRound, index);
            await daoProtocolSubmitRoot(propId, index, response.proof, response.nodes, {from: node1});

            // Challenge the proposal
            index = 8;
            console.log(`Challenging ${index}`);
            await daoProtocolCreateChallenge(propId, index, {from: node3});

            // Wait 1 hour
            await increaseTime(hre.web3, 60 * 60)

            // Defeat the proposal
            await daoProtocolDefeatProposal(propId, index, {from: node2});

            // Claim bounty
            await daoProtocolClaimBondChallenger(propId, [2], {from: node2});
            await daoProtocolClaimBondChallenger(propId, [4, 8], {from: node3});
            await daoProtocolClaimBondChallenger(propId, [3], {from: node4});
        });
    });
}
