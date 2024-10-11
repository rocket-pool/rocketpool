import { before, describe } from 'mocha';
import { userDeposit } from '../_helpers/deposit';
import { createMinipool, getMinipoolMinimumRPLStake, minipoolStates, stakeMinipool } from '../_helpers/minipool';
import { nodeStakeRPL, registerNode, setNodeTrusted } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import {
    RocketDAONodeTrustedProposals,
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAONodeTrustedSettingsProposals,
} from '../_utils/artifacts';
import {
    daoNodeTrustedExecute,
    daoNodeTrustedMemberLeave,
    daoNodeTrustedPropose,
    daoNodeTrustedVote,
} from '../dao/scenario-dao-node-trusted';
import { getDAOProposalEndTime, getDAOProposalStartTime } from '../dao/scenario-dao-proposal';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { assertBN } from '../_helpers/bn';
import { globalSnapShot } from '../_utils/snapshotting';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketMinipoolStatus', () => {
        let owner,
            node,
            trustedNode1,
            trustedNode2,
            trustedNode3,
            trustedNode4,
            staker,
            random;

        // Constants
        let proposalCooldown = 10;
        let proposalVoteBlocks = 10;
        let scrubPeriod = (60 * 60 * 24); // 24 hours

        // Setup
        let stakingMinipool1;
        let stakingMinipool2;
        let stakingMinipool3;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                trustedNode1,
                trustedNode2,
                trustedNode3,
                trustedNode4,
                staker,
                random,
            ] = await ethers.getSigners();

            // Register node
            await registerNode({ from: node });

            // Register trusted nodes
            await registerNode({ from: trustedNode1 });
            await registerNode({ from: trustedNode2 });
            await registerNode({ from: trustedNode3 });
            await setNodeTrusted(trustedNode1, 'saas_1', 'node1@home.com', owner);
            await setNodeTrusted(trustedNode2, 'saas_2', 'node2@home.com', owner);
            await setNodeTrusted(trustedNode3, 'saas_3', 'node3@home.com', owner);

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul('3'.BN);
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, { from: node });

            // Create minipools
            stakingMinipool1 = await createMinipool({ from: node, value: '16'.ether });
            stakingMinipool2 = await createMinipool({ from: node, value: '16'.ether });
            stakingMinipool3 = await createMinipool({ from: node, value: '16'.ether });

            // Make and assign deposits to minipools
            await userDeposit({ from: staker, value: '16'.ether });
            await userDeposit({ from: staker, value: '16'.ether });
            await userDeposit({ from: staker, value: '16'.ether });

            // Wait required scrub period
            await helpers.time.increase(scrubPeriod + 1);

            // Stake minipools
            await stakeMinipool(stakingMinipool1, { from: node });
            await stakeMinipool(stakingMinipool2, { from: node });
            await stakeMinipool(stakingMinipool3, { from: node });

            // Check minipool statuses
            let stakingStatus1 = await stakingMinipool1.getStatus.call();
            let stakingStatus2 = await stakingMinipool2.getStatus.call();
            let stakingStatus3 = await stakingMinipool3.getStatus.call();
            assertBN.equal(stakingStatus1, minipoolStates.Staking, 'Incorrect staking minipool status');
            assertBN.equal(stakingStatus2, minipoolStates.Staking, 'Incorrect staking minipool status');
            assertBN.equal(stakingStatus3, minipoolStates.Staking, 'Incorrect staking minipool status');

            // Set a small proposal cooldown
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.cooldown', proposalCooldown, { from: owner });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, { from: owner });
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
            await helpers.time.increase((await getDAOProposalEndTime(proposalId) - timeCurrent) + 1);
            // Proposal should be successful, lets execute it
            await daoNodeTrustedExecute(proposalId, { from: trustedNode1 });
            // Member can now leave and collect any RPL bond
            await daoNodeTrustedMemberLeave(trustedNode4, { from: trustedNode4 });
        }
    });
}
