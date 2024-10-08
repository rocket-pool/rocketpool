import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { executeUpdatePrices, submitPrices } from './scenario-submit-prices';
import {
    RocketDAONodeTrustedProposals,
    RocketDAONodeTrustedSettingsProposals,
    RocketDAOProtocolSettingsNetwork,
    RocketNetworkPrices,
} from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import {
    daoNodeTrustedExecute,
    daoNodeTrustedMemberLeave,
    daoNodeTrustedPropose,
    daoNodeTrustedVote,
} from '../dao/scenario-dao-node-trusted';
import { getDAOProposalEndTime, getDAOProposalStartTime } from '../dao/scenario-dao-proposal';
import { globalSnapShot } from '../_utils/snapshotting';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNetworkPrices', () => {
        let owner,
            node,
            trustedNode1,
            trustedNode2,
            trustedNode3,
            trustedNode4,
            random;

        // Constants
        const proposalCooldown = 60 * 60;
        const proposalVoteTime = 60 * 60;

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                trustedNode1,
                trustedNode2,
                trustedNode3,
                trustedNode4,
                random,
            ] = await ethers.getSigners();

            // Register node
            await registerNode({ from: node });

            // Register trusted nodes
            await registerNode({ from: trustedNode1 });
            await registerNode({ from: trustedNode2 });
            await registerNode({ from: trustedNode3 });
            await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);
            await setNodeTrusted(trustedNode2, 'saas_2', 'node@home.com', owner);
            await setNodeTrusted(trustedNode3, 'saas_3', 'node@home.com', owner);

            // Set a small proposal cooldown
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.cooldown.time', proposalCooldown, { from: owner });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.time', proposalVoteTime, { from: owner });
            // Set a small vote delay
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.delay.blocks', 4, { from: owner });

        });

        async function trustedNode4JoinDao() {
            await registerNode({ from: trustedNode4 });
            await setNodeTrusted(trustedNode4, 'saas_4', 'node@home.com', owner);
        }

        async function trustedNode4LeaveDao() {
            // Get contracts
            let rocketDAONodeTrustedProposals = await RocketDAONodeTrustedProposals.deployed();
            // Wait enough time to do a new proposal
            await helpers.time.increase(proposalCooldown);
            // Encode the calldata for the proposal
            let proposalCalldata = rocketDAONodeTrustedProposals.interface.encodeFunctionData('proposalLeave', [trustedNode4.address]);
            // Add the proposal
            let proposalId = await daoNodeTrustedPropose('hey guys, can I please leave the DAO?', proposalCalldata, {
                from: trustedNode4,
            });
            // Current block
            let timeCurrent = await helpers.time.latest();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await helpers.time.increase((await getDAOProposalStartTime(proposalId) - timeCurrent) + 2);
            // Now lets vote
            await daoNodeTrustedVote(proposalId, true, { from: trustedNode1 });
            await daoNodeTrustedVote(proposalId, true, { from: trustedNode2 });
            await daoNodeTrustedVote(proposalId, true, { from: trustedNode3 });
            // Fast forward to this voting period finishing
            timeCurrent = await helpers.time.latest();
            await helpers.time.increase((await getDAOProposalEndTime(proposalId) - timeCurrent) + 2);
            // Proposal should be successful, lets execute it
            await daoNodeTrustedExecute(proposalId, { from: trustedNode1 });
            // Member can now leave and collect any RPL bond
            await daoNodeTrustedMemberLeave(trustedNode4, { from: trustedNode4 });
        }

        it(printTitle('trusted nodes', 'can submit network prices'), async () => {
            // Set parameters
            let block = await ethers.provider.getBlockNumber();
            let slotTimestamp = '1600000000';
            let rplPrice = '0.02'.ether;

            // Submit different prices
            await submitPrices(block, slotTimestamp, '0.03'.ether, {
                from: trustedNode1,
            });
            await submitPrices(block, slotTimestamp, '0.04'.ether, {
                from: trustedNode2,
            });
            await submitPrices(block, slotTimestamp, '0.05'.ether, {
                from: trustedNode3,
            });

            // Set parameters
            block = await ethers.provider.getBlockNumber();

            // Submit identical prices to trigger update
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode2,
            });
        });

        it(printTitle('trusted nodes', 'cannot submit network prices while price submissions are disabled'), async () => {
            // Set parameters
            let block = await ethers.provider.getBlockNumber();
            let slotTimestamp = '1600000000';
            let rplPrice = '0.02'.ether;

            // Disable submissions
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.enabled', false, { from: owner });

            // Attempt to submit prices
            await shouldRevert(submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode1,
            }), 'Submitted prices while price submissions were disabled');
        });

        it(printTitle('trusted nodes', 'cannot submit network prices for a future block'), async () => {
            // Get current block
            let blockCurrent = await ethers.provider.getBlockNumber();
            let slotTimestamp = '1600000000';
            // Set parameters
            let block = blockCurrent + 1;
            let rplPrice = '0.02'.ether;

            // Attempt to submit prices for future block
            await shouldRevert(submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode1,
            }), 'Submitted prices for a future block');
        });

        it(printTitle('trusted nodes', 'cannot submit network prices for a lower block than recorded'), async () => {
            // Set parameters
            let block = await ethers.provider.getBlockNumber();
            let slotTimestamp = '1600000000';
            let rplPrice = '0.02'.ether;

            // Submit prices for block to trigger update
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode2,
            });

            // Attempt to submit prices for lower block
            await shouldRevert(submitPrices(block - 1, slotTimestamp, rplPrice, {
                from: trustedNode3,
            }), 'Submitted prices for a lower block');
        });

        it(printTitle('trusted nodes', 'can submit network prices for the current recorded block (vote past consensus)'), async () => {
            // Set parameters
            let block = await ethers.provider.getBlockNumber();
            let slotTimestamp = '1600000000';
            let rplPrice = '0.02'.ether;

            // Submit prices for block to trigger update
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode2,
            });

            // Attempt to submit prices for current block
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode3,
            });
        });

        it(printTitle('trusted nodes', 'cannot submit the same network prices twice'), async () => {
            // Set parameters
            let block = await ethers.provider.getBlockNumber();
            let slotTimestamp = '1600000000';
            let rplPrice = '0.02'.ether;

            // Submit prices for block
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode1,
            });

            // Attempt to submit prices for block again
            await shouldRevert(submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode1,
            }), 'Submitted the same network prices twice');
        });

        it(printTitle('regular nodes', 'cannot submit network prices'), async () => {
            // Set parameters
            let block = await ethers.provider.getBlockNumber();
            let slotTimestamp = '1600000000';
            let rplPrice = '0.02'.ether;

            // Attempt to submit prices
            await shouldRevert(submitPrices(block, slotTimestamp, rplPrice, {
                from: node,
            }), 'Regular node submitted network prices');
        });

        it(printTitle('random', 'can execute price update when consensus is reached after member count changes'), async () => {
            // Setup
            await trustedNode4JoinDao();
            // Set parameters
            let block = await ethers.provider.getBlockNumber();
            let slotTimestamp = '1600000000';
            let rplPrice = '0.02'.ether;
            // Submit same price from 2 nodes (not enough for 4 member consensus but enough for 3)
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode2,
            });
            // trustedNode4 leaves the DAO
            await trustedNode4LeaveDao();
            // There is now consensus with the remaining 3 trusted nodes about the price, try to execute the update
            await executeUpdatePrices(block, slotTimestamp, rplPrice, {
                from: random,
            });
        });

        it(printTitle('random', 'cannot execute price update without consensus'), async () => {
            // Setup
            await trustedNode4JoinDao();
            // Set parameters
            let block = await ethers.provider.getBlockNumber();
            let slotTimestamp = '1600000000';
            let rplPrice = '0.02'.ether;
            // Submit same price from 2 nodes (not enough for 4 member consensus)
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, slotTimestamp, rplPrice, {
                from: trustedNode2,
            });
            // There is no consensus so execute should fail
            await shouldRevert(executeUpdatePrices(block, slotTimestamp, rplPrice, {
                from: random,
            }), 'Random account could execute update prices without consensus');
        });
    });
}
