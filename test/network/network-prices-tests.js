import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { executeUpdatePrices, submitPrices } from './scenario-submit-prices'
import { RocketDAONodeTrustedSettingsProposals, RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts'
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap'
import { daoNodeTrustedExecute, daoNodeTrustedMemberLeave, daoNodeTrustedPropose, daoNodeTrustedVote } from '../dao/scenario-dao-node-trusted'
import { getDAOProposalEndBlock, getDAOProposalStartBlock } from '../dao/scenario-dao-proposal'

export default function() {
    contract('RocketNetworkPrices', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode1,
            trustedNode2,
            trustedNode3,
            trustedNode4,   // Joins and leaves DAO in certain tests
            random
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Constants
        let proposalCooldown = 10
        let proposalVoteBlocks = 10


        // Setup
        before(async () => {

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

        });


        async function trustedNode4JoinDao() {
            await registerNode({from: trustedNode4});
            await setNodeTrusted(trustedNode4, 'saas_4', 'node@home.com', owner);
        }


        async function trustedNode4LeaveDao() {
            // Wait enough time to do a new proposal
            await mineBlocks(web3, proposalCooldown);
            // Encode the calldata for the proposal
            let proposalCallData = web3.eth.abi.encodeFunctionCall(
              {name: 'proposalLeave', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}]},
              [trustedNode4]
            );
            // Add the proposal
            let proposalId = await daoNodeTrustedPropose('hey guys, can I please leave the DAO?', proposalCallData, {
                from: trustedNode4
            });
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalId)-blockCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalId, true, { from: trustedNode1 });
            await daoNodeTrustedVote(proposalId, true, { from: trustedNode2 });
            await daoNodeTrustedVote(proposalId, true, { from: trustedNode3 });
            // Fast forward to this voting period finishing
            await mineBlocks(web3, (await getDAOProposalEndBlock(proposalId)-blockCurrent)+1);
            // Proposal should be successful, lets execute it
            await daoNodeTrustedExecute(proposalId, { from: trustedNode1 });
            // Member can now leave and collect any RPL bond
            await daoNodeTrustedMemberLeave(trustedNode4, { from: trustedNode4 });
        }


        it(printTitle('trusted nodes', 'can submit network prices'), async () => {

            // Set parameters
            let block = 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Submit different prices
            await submitPrices(block, web3.utils.toWei('0.03', 'ether'), {
                from: trustedNode1,
            });
            await submitPrices(block, web3.utils.toWei('0.04', 'ether'), {
                from: trustedNode2,
            });
            await submitPrices(block, web3.utils.toWei('0.05', 'ether'), {
                from: trustedNode3,
            });

            // Set parameters
            block = 2;

            // Submit identical prices to trigger update
            await submitPrices(block, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, rplPrice, {
                from: trustedNode2,
            });

        });


        it(printTitle('trusted nodes', 'cannot submit network prices while price submissions are disabled'), async () => {

            // Set parameters
            let block = 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Disable submissions
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.enabled', false, {from: owner});

            // Attempt to submit prices
            await shouldRevert(submitPrices(block, rplPrice, {
                from: trustedNode1,
            }), 'Submitted prices while price submissions were disabled');

        });


        it(printTitle('trusted nodes', 'cannot submit network prices for a future block'), async () => {

            // Get current block
            let blockCurrent = await web3.eth.getBlockNumber();

            // Set parameters
            let block = blockCurrent + 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Attempt to submit prices for future block
            await shouldRevert(submitPrices(block, rplPrice, {
                from: trustedNode1,
            }), 'Submitted prices for a future block');

        });


        it(printTitle('trusted nodes', 'cannot submit network prices for the current recorded block or lower'), async () => {

            // Set parameters
            let block = 2;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Submit prices for block to trigger update
            await submitPrices(block, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, rplPrice, {
                from: trustedNode2,
            });

            // Attempt to submit prices for current block
            await shouldRevert(submitPrices(block, rplPrice, {
                from: trustedNode3,
            }), 'Submitted prices for the current block');

            // Attempt to submit prices for lower block
            await shouldRevert(submitPrices(block - 1, rplPrice, {
                from: trustedNode3,
            }), 'Submitted prices for a lower block');

        });


        it(printTitle('trusted nodes', 'cannot submit the same network prices twice'), async () => {

            // Set parameters
            let block = 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Submit prices for block
            await submitPrices(block, rplPrice, {
                from: trustedNode1,
            });

            // Attempt to submit prices for block again
            await shouldRevert(submitPrices(block, rplPrice, {
                from: trustedNode1,
            }), 'Submitted the same network prices twice');

        });


        it(printTitle('regular nodes', 'cannot submit network prices'), async () => {

            // Set parameters
            let block = 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');

            // Attempt to submit prices
            await shouldRevert(submitPrices(block, rplPrice, {
                from: node,
            }), 'Regular node submitted network prices');

        });


        it(printTitle('random', 'can execute price update when consensus is reached after member count changes'), async () => {
            // Setup
            await trustedNode4JoinDao();
            // Set parameters
            let block = 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');
            // Submit same price from 2 nodes (not enough for 4 member consensus but enough for 3)
            await submitPrices(block, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, rplPrice, {
                from: trustedNode2,
            });
            // trustedNode4 leaves the DAO
            await trustedNode4LeaveDao();
            // There is now consensus with the remaining 3 trusted nodes about the price, try to execute the update
            await executeUpdatePrices(block, rplPrice, {
                from: random
            })
        });


        it(printTitle('random', 'cannot execute price update without consensus'), async () => {
            // Setup
            await trustedNode4JoinDao();
            // Set parameters
            let block = 1;
            let rplPrice = web3.utils.toWei('0.02', 'ether');
            // Submit same price from 2 nodes (not enough for 4 member consensus)
            await submitPrices(block, rplPrice, {
                from: trustedNode1,
            });
            await submitPrices(block, rplPrice, {
                from: trustedNode2,
            });
            // There is no consensus so execute should fail
            await shouldRevert(executeUpdatePrices(block, rplPrice, {
                from: random
            }), 'Random account could execute update prices without consensus')
        });

    });
}
