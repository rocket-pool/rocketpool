import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { nodeStakeRPL, registerNode, setNodeTrusted } from '../_helpers/node';
import { RocketDAONodeTrustedSettingsProposals, RocketMinipoolPenalty } from '../_utils/artifacts';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { createMinipool, getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { submitPenalty } from './scenario-submit-penalties';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import { globalSnapShot } from '../_utils/snapshotting';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNetworkPenalties', () => {
        let owner,
            node,
            trustedNode1,
            trustedNode2,
            trustedNode3,
            trustedNode4,
            random;

        let minipool;

        // Constants
        const proposalCooldown = 10;
        const proposalVoteBlocks = 10;

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
            // Set max penalty rate
            let rocketMinipoolPenalty = await RocketMinipoolPenalty.deployed();
            rocketMinipoolPenalty.setMaxPenaltyRate('1'.ether, { from: owner });

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake * 1n;
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, { from: node });

            // Create a minipool
            await userDeposit({ from: random, value: '16'.ether });
            minipool = await createMinipool({ from: node, value: '16'.ether }, 0);
        });

        it(printTitle('trusted nodes', 'can submit penalties'), async () => {
            // Set parameters
            let minipoolAddress = minipool.target;

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
            }
        });

        it(printTitle('node operator', 'cannot submit penalties'), async () => {
            // Set parameters
            let block = 1;
            let minipoolAddress = minipool.target;

            // Submit different balances
            await shouldRevert(submitPenalty(minipoolAddress, block, {
                from: node,
            }), 'Was able to submit penalty', 'Invalid trusted node');
        });
    });
}
