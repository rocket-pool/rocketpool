import { mineBlocks, increaseTime, getCurrentTime } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { executeUpdateBalances, submitBalances } from './scenario-submit-balances'
import { RocketDAONodeTrustedSettingsProposals, RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts'
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { daoNodeTrustedExecute, daoNodeTrustedMemberLeave, daoNodeTrustedPropose, daoNodeTrustedVote } from '../dao/scenario-dao-node-trusted'
import { getDAOProposalEndTime, getDAOProposalStartTime } from '../dao/scenario-dao-proposal'
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap'

export default function() {
    contract('RocketNetworkBalances', async (accounts) => {


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
            // Set a small vote delay
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.delay.blocks', 4, { from: owner });

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
            let timeCurrent = await getCurrentTime(web3);
            // Now mine blocks until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalId)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalId, true, { from: trustedNode1 });
            await daoNodeTrustedVote(proposalId, true, { from: trustedNode2 });
            await daoNodeTrustedVote(proposalId, true, { from: trustedNode3 });
            // Fast forward to this voting period finishing
            timeCurrent = await getCurrentTime(web3);
            await increaseTime(web3, (await getDAOProposalEndTime(proposalId)-timeCurrent)+2);
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
            await submitBalances(block, slotTimestamp,  totalBalance, stakingBalance, rethSupply, {
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
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.balances.enabled', false, {from: owner});

            // Attempt to submit balances
            await shouldRevert(submitBalances(block, slotTimestamp, totalBalance, stakingBalance, rethSupply, {
                from: trustedNode1,
            }), 'Submitted balances while balance submissions were disabled');

        });


        it(printTitle('trusted nodes', 'cannot submit network balances for a future block'), async () => {

            // Get current block
            let blockCurrent = await web3.eth.getBlockNumber();

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
                from: random
            })
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
                from: random
            }), 'Random account could execute update balances without consensus')
        });
    });
}
