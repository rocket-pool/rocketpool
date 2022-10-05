import { mineBlocks, increaseTime, getCurrentTime } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { nodeStakeRPL, registerNode, setNodeTrusted } from '../_helpers/node';
import { executeUpdateBalances, submitBalances } from './scenario-submit-balances'
import {
    RocketDAONodeTrusted,
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAONodeTrustedSettingsProposals,
    RocketDAOProtocolSettingsNetwork, RocketMinipoolPenalty
} from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { daoNodeTrustedExecute, daoNodeTrustedMemberLeave, daoNodeTrustedPropose, daoNodeTrustedVote } from '../dao/scenario-dao-node-trusted'
import { getDAOProposalEndTime, getDAOProposalStartTime } from '../dao/scenario-dao-proposal'
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap'
import { createMinipool, getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { submitPenalty } from './scenario-submit-penalties';
import { mintRPL } from '../_helpers/tokens';
import { upgradeOneDotTwo } from '../_utils/upgrade';
import { userDeposit } from '../_helpers/deposit';

export default function() {
    contract('RocketNetworkPenalties', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode1,
            trustedNode2,
            trustedNode3,
            trustedNode4,
            random
        ] = accounts;

        let minipool;

        // Constants
        let proposalCooldown = 10;
        let proposalVoteBlocks = 10;


        // Setup
        before(async () => {
            await upgradeOneDotTwo(owner);

            // Register node
            await registerNode({from: node});

            // Register trusted nodes
            await registerNode({from: trustedNode1});
            await registerNode({from: trustedNode2});
            await registerNode({from: trustedNode3});
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
            rocketMinipoolPenalty.setMaxPenaltyRate(web3.utils.toWei('1', 'ether'), {from: owner})

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(web3.utils.toBN(1));
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Create a minipool
            await userDeposit({from: random, value: web3.utils.toWei('16', 'ether')})
            minipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')}, 0);
        });


        it(printTitle('trusted nodes', 'can submit penalties'), async () => {

            // Set parameters
            let minipoolAddress = minipool.address;

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
            let minipoolAddress = minipool.address;

            // Submit different balances
            await shouldRevert(submitPenalty(minipoolAddress, block, {
                from: node,
            }), 'Was able to submit penalty', 'Invalid trusted node');

        });

    });
}
