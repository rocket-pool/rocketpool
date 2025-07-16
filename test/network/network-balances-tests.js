import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { executeUpdateBalances, submitBalances } from './scenario-submit-balances';
import {
    RocketDAONodeTrustedProposals,
    RocketDAONodeTrustedSettingsProposals,
    RocketDAOProtocolSettingsNetwork,
} from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import {
    daoNodeTrustedExecute,
    daoNodeTrustedMemberLeave,
    daoNodeTrustedPropose,
    daoNodeTrustedVote,
} from '../dao/scenario-dao-node-trusted';
import { getDAOProposalEndTime, getDAOProposalStartTime } from '../dao/scenario-dao-proposal';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { globalSnapShot } from '../_utils/snapshotting';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNetworkBalances', () => {
        let owner,
            node,
            trustedNode1,
            trustedNode2,
            trustedNode3,
            trustedNode4,
            random;

        // Constants
        const proposalCooldown = 10;
        const proposalVoteBlocks = 10;
        const submitBalancesFrequency = 3600;

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
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.cooldown', proposalCooldown, { from: owner });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            // Set a small vote delay
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.delay.blocks', 4, { from: owner });
            // Set a smaller submission frequency
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.balances.frequency', submitBalancesFrequency, { from: owner });
        });

        async function submitAll(block, slotTimestamp, totalBalance, stakingBalance, rethSupply) {
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, { from: trustedNode1 });
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, { from: trustedNode2 });
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, { from: trustedNode3 });
        }

        async function trustedNode4JoinDao() {
            await registerNode({ from: trustedNode4 });
            await setNodeTrusted(trustedNode4, 'saas_4', 'node@home.com', owner);
        }

        async function trustedNode4LeaveDao() {
            // Get contracts
            const rocketDAONodeTrustedProposals = await RocketDAONodeTrustedProposals.deployed();
            // Wait enough time to do a new proposal
            await helpers.mine(proposalCooldown);
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
            // Fast-forward to this voting period finishing
            timeCurrent = await helpers.time.latest();
            await helpers.time.increase((await getDAOProposalEndTime(proposalId) - timeCurrent) + 2);
            // Proposal should be successful, lets execute it
            await daoNodeTrustedExecute(proposalId, { from: trustedNode1 });
            // Member can now leave and collect any RPL bond
            await daoNodeTrustedMemberLeave(trustedNode4, { from: trustedNode4 });
        }

        it(printTitle('trusted nodes', 'can submit network balances'), async () => {
            // Set parameters
            let block = 1;
            let slotTimestamp = '1600000000';
            let totalBalance = '10'.ether;
            let stakingBalance = '9'.ether;
            let rethSupply = '8'.ether;

            // Submit different balances
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, '7'.ether, {
                from: trustedNode1,
            });
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, '6'.ether, {
                from: trustedNode2,
            });
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, '5'.ether, {
                from: trustedNode3,
            });

            // Set parameters
            block = 2;

            // Submit identical balances to trigger update
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode2,
            });
        });

        it(printTitle('trusted nodes', 'cannot submit network balances while balance submissions are disabled'), async () => {
            // Set parameters
            let block = 1;
            let slotTimestamp = '1600000000';
            let totalBalance = '10'.ether;
            let stakingBalance = '9'.ether;
            let rethSupply = '8'.ether;

            // Disable submissions
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.balances.enabled', false, { from: owner });

            // Attempt to submit balances
            await shouldRevert(submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            }), 'Submitted balances while balance submissions were disabled');
        });

        it(printTitle('trusted nodes', 'cannot submit network balances for a future block'), async () => {
            // Get current block
            let blockCurrent = await ethers.provider.getBlockNumber();

            // Set parameters
            let block = blockCurrent + 1;
            let slotTimestamp = '1600000000';
            let totalBalance = '10'.ether;
            let stakingBalance = '9'.ether;
            let rethSupply = '8'.ether;

            // Attempt to submit balances for future block
            await shouldRevert(submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            }), 'Submitted balances for a future block');
        });

        it(printTitle('trusted nodes', 'cannot submit network balances for a lower block than recorded'), async () => {
            // Set parameters
            let block = 2;
            let slotTimestamp = '1600000000';
            let totalBalance = '10'.ether;
            let stakingBalance = '9'.ether;
            let rethSupply = '8'.ether;

            // Submit balances for block to trigger update
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode2,
            });

            // Attempt to submit balances for lower block
            await shouldRevert(submitBalances(block - 1, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode3,
            }), 'Submitted balances for a lower block');
        });

        it(printTitle('trusted nodes', 'can submit network balances for the same block as recorded (vote past consensus)'), async () => {
            // Set parameters
            let block = 2;
            let slotTimestamp = '1600000000';
            let totalBalance = '10'.ether;
            let stakingBalance = '9'.ether;
            let rethSupply = '8'.ether;

            // Submit balances for block to trigger update
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode2,
            });

            // Attempt to submit balances for current block
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode3,
            });
        });

        it(printTitle('trusted nodes', 'cannot submit network balances until 95% of submission frequency has passed'), async () => {
            // First submission is fine
            await submitAll(2, '1600000000', '10'.ether, '9'.ether, '8'.ether);
            // Wait only a brief period
            await helpers.time.increase(1);
            await helpers.mine();
            // Submitting should now fail
            await shouldRevert(
                submitAll(3, '1600000001', '10.1'.ether, '9.1'.ether, '8.1'.ether),
                'Was able to submit balances too soon',
                'Not enough time has passed',
            );
            // Wait enough time
            await helpers.time.increase(submitBalancesFrequency);
            await helpers.mine();
            // Submitting should now work
            await submitAll(4, '1600000001', '10.1'.ether, '9.1'.ether, '8.1'.ether);
        });

        it(printTitle('trusted nodes', 'cannot submit network balance change that exceeds 2%'), async () => {
            // First submission is fine
            await submitAll(2, '1600000000', '10'.ether, '9'.ether, '8'.ether);
            // Wait enough time
            await helpers.time.increase(submitBalancesFrequency);
            await helpers.mine();
            // Submitting an increase of 2.1% should only result in a 2% change
            await submitAll(3, '1600000001', '10.21'.ether, '9.1'.ether, '8.1'.ether);
        });

        it(printTitle('trusted nodes', 'cannot submit the same network balances twice'), async () => {
            // Set parameters
            let block = 1;
            let slotTimestamp = '1600000000';
            let totalBalance = '10'.ether;
            let stakingBalance = '9'.ether;
            let rethSupply = '8'.ether;

            // Submit balances for block
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });

            // Attempt to submit balances for block again
            await shouldRevert(submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            }), 'Submitted the same network balances twice');
        });

        it(printTitle('regular nodes', 'cannot submit network balances'), async () => {
            // Set parameters
            let block = 1;
            let slotTimestamp = '1600000000';
            let totalBalance = '10'.ether;
            let stakingBalance = '9'.ether;
            let rethSupply = '8'.ether;

            // Attempt to submit balances
            await shouldRevert(submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: node,
            }), 'Regular node submitted network balances');
        });

        it(printTitle('random', 'can execute balances update when consensus is reached after member count changes'), async () => {
            // Setup
            await trustedNode4JoinDao();
            // Set parameters
            let block = 1;
            let slotTimestamp = '1600000000';
            let totalBalance = '10'.ether;
            let stakingBalance = '9'.ether;
            let rethSupply = '8'.ether;
            // Submit same parameters from 2 nodes (not enough for 4 member consensus but enough for 3)
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode2,
            });
            // trustedNode4 leaves the DAO
            await trustedNode4LeaveDao();
            // There is now consensus with the remaining 3 trusted nodes about the balances, try to execute the update
            await executeUpdateBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: random,
            });
        });

        it(printTitle('random', 'cannot execute balances update without consensus'), async () => {
            // Setup
            await trustedNode4JoinDao();
            // Set parameters
            let block = 1;
            let slotTimestamp = '1600000000';
            let totalBalance = '10'.ether;
            let stakingBalance = '9'.ether;
            let rethSupply = '8'.ether;
            // Submit same price from 2 nodes (not enough for 4 member consensus)
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            });
            await submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode2,
            });
            // There is no consensus so execute should fail
            await shouldRevert(executeUpdateBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: random,
            }), 'Random account could execute update balances without consensus');
        });
    });
}
