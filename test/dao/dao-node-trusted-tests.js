import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode } from '../_helpers/node';
import { mintDummyRPL } from '../token/scenario-rpl-mint-fixed';
import { burnFixedRPL } from '../token/scenario-rpl-burn-fixed';
import { allowDummyRPL } from '../token/scenario-rpl-allow-fixed';
import { setDaoNodeTrustedBootstrapMember, setDAONodeTrustedBootstrapSetting } from './scenario-dao-node-trusted-bootstrap';
import { daoNodeTrustedExecute, getDAOMemberIsValid, getDAONodeMemberCount, daoNodeTrustedPropose, daoNodeTrustedVote, daoNodeTrustedCancel, daoNodeTrustedMemberJoin, daoNodeTrustedMemberLeave, daoNodeTrustedMemberReplace, getDAONodeProposalQuorumVotesRequired, } from './scenario-dao-node-trusted';
import { proposalStates, getDAOProposalState, getDAOProposalStartBlock, getDAOProposalEndBlock, getDAOProposalVotesFor, getDAOProposalVotesAgainst } from './scenario-dao-proposal';

// Contracts
import { RocketDAONodeTrusted, RocketDAONodeTrustedActions, RocketDAONodeTrustedSettings, RocketVault, RocketTokenRPL } from '../_utils/artifacts'; 


export default function() {
    contract('RocketDAONodeTrusted', async (accounts) => {


        // Accounts
        const [
            owner,
            userOne,
            userTwo,
            registeredNode1,
            registeredNode2,
            registeredNode3,
            registeredNodeTrusted1,
            registeredNodeTrusted2,
            registeredNodeTrusted3,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });




        // Mints fixed supply RPL, burns that for new RPL and gives it to the account
        let rplMint = async function(_account, _amount) {
            // Load contracts
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            
            // Convert
            _amount = web3.utils.toWei(_amount.toString(), 'ether');
            // Mint RPL fixed supply for the users to simulate current users having RPL
            await mintDummyRPL(_account, _amount, { from: owner });
            // Mint a large amount of dummy RPL to owner, who then burns it for real RPL which is sent to nodes for testing below
            await allowDummyRPL(rocketTokenRPL.address, _amount, { from: _account });
            // Burn existing fixed supply RPL for new RPL
            await burnFixedRPL(_amount, { from: _account }); 

        }

        // Allow the given account to spend this users RPL
        let rplAllowanceDAO = async function(_account, _amount) {
            // Load contracts
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed();
            // Convert
            _amount = web3.utils.toWei(_amount.toString(), 'ether');
            // Approve now
            await rocketTokenRPL.approve(rocketDAONodeTrustedActions.address, _amount, { from: _account });
        }

        // Add a new DAO member via bootstrap mode
        let bootstrapMemberAdd = async function(_account, _id, _email) {
            // Get the DAO settings
            let daoNodesettings = await RocketDAONodeTrustedSettings.deployed();
            // How much RPL is required for a trusted node bond?
            let rplBondAmount = web3.utils.fromWei(await daoNodesettings.getRPLBond());
            // Mint RPL bond required for them to join
            await rplMint(_account, rplBondAmount);
            // Set allowance for the Vault to grab the bond
            await rplAllowanceDAO(_account, rplBondAmount);
            // Create invites for them to become a member
            await setDaoNodeTrustedBootstrapMember(_id, _email, _account, {from: owner});
            // Now get them to join
            await daoNodeTrustedMemberJoin({from: _account});
        }

        // Setup
        before(async () => {

            // Register nodes
            await registerNode({from: registeredNode1});
            await registerNode({from: registeredNode2});
            await registerNode({from: registeredNodeTrusted1});
            await registerNode({from: registeredNodeTrusted2});
            // Add members to the DAO now
            await bootstrapMemberAdd(registeredNodeTrusted1, 'rocketpool_1', 'node@home.com');
            await bootstrapMemberAdd(registeredNodeTrusted2, 'rocketpool_2', 'node@home.com');

        });


        //
        // Start Tests
        //

        it(printTitle('userOne', 'fails to be added as a trusted node dao member as they are not a registered node'), async () => {
            // Set as trusted dao member via bootstrapping
            await shouldRevert(setDaoNodeTrustedBootstrapMember('rocketpool', 'node@home.com', userOne, {
                from: owner
            }), 'Non registered node added to trusted node DAO', 'Invalid node');
        });


        it(printTitle('userOne', 'fails to add a bootstrap trusted node DAO member as non owner'), async () => {
            // Set as trusted dao member via bootstrapping
            await shouldRevert(setDaoNodeTrustedBootstrapMember('rocketpool', 'node@home.com', registeredNode1, {
                from: userOne
            }), 'Non owner registered node to trusted node DAO', 'Account is not Rocket Pool or the DAO');
        });

        it(printTitle('owner', 'cannot add the same member twice'), async () => {
            // Set as trusted dao member via bootstrapping
            await shouldRevert(setDaoNodeTrustedBootstrapMember('rocketpool', 'node@home.com', registeredNodeTrusted2, {
                from: owner
            }), 'Owner the same DAO member twice', 'This node is already part of the trusted node DAO');
        });

  
        it(printTitle('owner', 'fails to add more than the 3 min required bootstrap trusted node dao members'), async () => {
            // Add our 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool', 'node@home.com');
            // Set as trusted dao member via bootstrapping
            await shouldRevert(bootstrapMemberAdd(registeredNode2, 'rocketpool', 'node@home.com')
                , 'Owner added more than 3 bootstrap trusted node dao members', 'Bootstrap mode not engaged, min DAO member count has been met');
        });
        

        it(printTitle('owner', 'updates quorum setting while bootstrap mode is enabled'), async () => {
            // Set as trusted dao member via bootstrapping
            await setDAONodeTrustedBootstrapSetting('quorum', web3.utils.toWei('0.55'), {
                from: owner
            });
        });


        it(printTitle('owner', 'updates RPL bond setting while bootstrap mode is enabled'), async () => {
            // Set RPL Bond at 10K RPL
            await setDAONodeTrustedBootstrapSetting('rplbond', web3.utils.toWei('10000'), {
                from: owner
            });
        });

        it(printTitle('userOne', 'fails to update RPL bond setting while bootstrap mode is enabled as they are not the owner'), async () => {
            // Update setting
            await shouldRevert(setDAONodeTrustedBootstrapSetting('rplbond', web3.utils.toWei('10000'), {
                from: userOne
            }), 'UserOne changed RPL bond setting', 'Account is not Rocket Pool or the DAO');
        });


        it(printTitle('owner', 'fails to update setting after bootstrap mode is disabled'), async () => {
            // Add our 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool', 'node@home.com');
            // Update setting
            await shouldRevert(setDAONodeTrustedBootstrapSetting('quorum', web3.utils.toWei('0.55'), {
                from: owner
            }), 'Owner updated setting after bootstrap mode is disabled', 'Bootstrap mode not engaged, min DAO member count has been met');
        });


        it(printTitle('owner', 'fails to set quorum setting below 51% while bootstrap mode is enabled'), async () => {
            // Update setting
            await shouldRevert(setDAONodeTrustedBootstrapSetting('quorum', web3.utils.toWei('0.50'), {
                from: owner
            }), 'Owner changed quorum setting to invalid value', 'Quorum setting must be >= 51% and <= 90%');
        });

    
        it(printTitle('owner', 'fails to set quorum setting above 90% while bootstrap mode is enabled'), async () => {
            // Update setting
            await shouldRevert(setDAONodeTrustedBootstrapSetting('quorum', web3.utils.toWei('0.91'), {
                from: owner
            }), 'Owner changed quorum setting to invalid value', 'Quorum setting must be >= 51% and <= 90%');
        });
        


        it(printTitle('registeredNode1', 'verify trusted node quorum votes required is correct'), async () => {
            // Load contracts
            const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
            const rocketDAONodeTrustedSettings = await RocketDAONodeTrustedSettings.deployed();
            // How many trusted nodes do we have?
            let trustedNodeCount =  await rocketDAONodeTrusted.getMemberCount({
                from: registeredNode1,
            });
            // Get the current quorum threshold
            let quorumThreshold = await rocketDAONodeTrustedSettings.getQuorum();
            // Calculate the expected vote threshold
            let expectedVotes = (Number(web3.utils.fromWei(quorumThreshold)) * Number(trustedNodeCount)).toFixed(2);
            // Calculate it now on the contracts
            let quorumVotes = await rocketDAONodeTrusted.getMemberQuorumVotesRequired({
                from: registeredNode1,
            });
            // Verify
            assert(expectedVotes == Number(web3.utils.fromWei(quorumVotes)).toFixed(2), "Expected vote threshold does not match contracts");         
        });
        
        // The big test
        it(printTitle('registeredNodeTrusted1&2', 'create two proposals for two new members that are voted in, one then chooses to leave and is allowed too'), async () => {
            // Get the DAO settings
            let daoNodesettings = await RocketDAONodeTrustedSettings.deployed();
            // Total current members
            let totalMembers = await getDAONodeMemberCount();
            // How much RPL is required for a trusted node bond?
            let rplBondAmount = web3.utils.fromWei(await daoNodesettings.getRPLBond());
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10;
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting('proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting('proposal.execute.blocks', proposalVoteExecuteBlocks, { from: owner });
            // New Member 1
            // Encode the calldata for the proposal
            let proposalCalldata1 = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_email'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider1', 'test@sass.com', registeredNode1]
            );
            // Add the proposal
            let proposalID_1 = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata1, {
                from: registeredNodeTrusted1
            });
            // New Member 2
            // Encode the calldata for the proposal
            let proposalCalldata2 = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_email'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider2', 'test2@sass.com', registeredNode2]
            );
            // Add the proposal
            let proposalID_2 = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata2, {
                from: registeredNodeTrusted2
            });
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID_1)-blockCurrent)+2);
            // Now lets vote for the new members
            await daoNodeTrustedVote(proposalID_1, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID_1, true, { from: registeredNodeTrusted2 });
            await daoNodeTrustedVote(proposalID_2, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID_2, true, { from: registeredNodeTrusted2 });
            // Current block
            blockCurrent = await web3.eth.getBlockNumber();
            // Fast forward to voting periods finishing
            await mineBlocks(web3, (await getDAOProposalEndBlock(proposalID_1)-blockCurrent)+2);
            // Proposal should be successful, lets execute it
            await daoNodeTrustedExecute(proposalID_1, { from: registeredNodeTrusted1 });
            await daoNodeTrustedExecute(proposalID_2, { from: registeredNodeTrusted1 });
            // Member has now been invited to join, so lets do that
            // We'll allow the DAO to transfer our RPL bond before joining
            await rplMint(registeredNode1, rplBondAmount);
            await rplAllowanceDAO(registeredNode1, rplBondAmount);
            await rplMint(registeredNode2, rplBondAmount);
            await rplAllowanceDAO(registeredNode2, rplBondAmount);
            // Join now
            await daoNodeTrustedMemberJoin({from: registeredNode1});
            await daoNodeTrustedMemberJoin({from: registeredNode2});
            // Now registeredNodeTrusted2 wants to leave
            // Encode the calldata for the proposal
            let proposalCalldata3 = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalLeave', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}]},
                [registeredNodeTrusted2]
            );
            // Add the proposal
            let proposalID_3 = await daoNodeTrustedPropose('hey guys, can I please leave the DAO?', proposalCalldata3, {
                from: registeredNodeTrusted2
            });
            // Current block
            blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID_3)-blockCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalID_3, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID_3, true, { from: registeredNodeTrusted2 });
            await daoNodeTrustedVote(proposalID_3, false, { from: registeredNode1 });
            await daoNodeTrustedVote(proposalID_3, true, { from: registeredNode2 });
            // Fast forward to this voting period finishing
            await mineBlocks(web3, (await getDAOProposalEndBlock(proposalID_3)-blockCurrent)+1);
            // Proposal should be successful, lets execute it
            await daoNodeTrustedExecute(proposalID_3, { from: registeredNodeTrusted2 });
            // Member can now leave and collect any RPL bond
            await daoNodeTrustedMemberLeave(registeredNodeTrusted2, {from: registeredNodeTrusted2});
        });

        // Test various proposal states
        it(printTitle('registeredNodeTrusted1', 'creates a proposal and verifies the proposal states as it passes and is executed'), async () => {
            // Get the DAO settings
            const daoNode = await RocketDAONodeTrusted.deployed();
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting('proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting('proposal.execute.blocks', proposalVoteExecuteBlocks, { from: owner });
            // Add our 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool', 'node@home.com');
            // Now registeredNodeTrusted2 wants to leave
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_email'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider', 'test@sass.com', registeredNode2]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Verify the proposal is pending
            assert(await getDAOProposalState(proposalID) == proposalStates.Pending, 'Proposal state is not Pending');
            // Verify voting will not work while pending
            await shouldRevert(daoNodeTrustedVote(proposalID, true, { from: registeredNode1 }), 'Member voted while proposal was pending', 'Voting is not active for this proposal');
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID)-blockCurrent)+1);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNode1 });
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted2 });   
            await shouldRevert(daoNodeTrustedVote(proposalID, false, { from: registeredNodeTrusted1 }), 'Member voted after proposal has passed', 'Proposal has passed, voting is complete and the proposal can now be executed');
            // Verify the proposal is successful
            assert(await getDAOProposalState(proposalID) == proposalStates.Succeeded, 'Proposal state is not succeeded');
            // Proposal has passed, lets execute it now
            await daoNodeTrustedExecute(proposalID, { from: registeredNode1 });
            // Verify the proposal has executed
            assert(await getDAOProposalState(proposalID) == proposalStates.Executed, 'Proposal state is not executed');
        });
        

        // Test various proposal states
        it(printTitle('registeredNodeTrusted1', 'creates a proposal and verifies the proposal states as it fails after it expires'), async () => {
            // Get the DAO settings
            const daoNode = await RocketDAONodeTrusted.deployed();
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting('proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting('proposal.execute.blocks', proposalVoteExecuteBlocks, { from: owner });
            // Add our 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool', 'node@home.com');
            // Now registeredNodeTrusted2 wants to leave
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_email'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider', 'test@sass.com', registeredNode2]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Verify the proposal is pending
            assert(await getDAOProposalState(proposalID) == proposalStates.Pending, 'Proposal state is not Pending');
            // Verify voting will not work while pending
            await shouldRevert(daoNodeTrustedVote(proposalID, true, { from: registeredNode1 }), 'Member voted while proposal was pending', 'Voting is not active for this proposal');
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID)-blockCurrent)+1);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNode1 });
            await daoNodeTrustedVote(proposalID, false, { from: registeredNodeTrusted2 });   
            await daoNodeTrustedVote(proposalID, false, { from: registeredNodeTrusted1 });
            // Fast forward to this voting period finishing
            await mineBlocks(web3, (await getDAOProposalEndBlock(proposalID)-blockCurrent)+1);
            // Verify the proposal is successful
            assert(await getDAOProposalState(proposalID) == proposalStates.Defeated, 'Proposal state is not defeated');
            // Proposal has failed, can we execute it anyway?
            await shouldRevert(daoNodeTrustedExecute(proposalID, { from: registeredNode1 }), 'Executed defeated proposal', 'Proposal has not succeeded, has expired or has already been executed');;
        });

        
        it(printTitle('registeredNodeTrusted1', 'creates a proposal for registeredNode1 to join as a new member but cancels it before it passes'), async () => {
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting('proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting('proposal.execute.blocks', proposalVoteExecuteBlocks, { from: owner });
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_email'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider', 'test@sass.com', registeredNode1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID)-blockCurrent)+1);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            // Current block
            blockCurrent = await web3.eth.getBlockNumber();
            // Cancel now before it passes
            await daoNodeTrustedCancel(proposalID, {from: registeredNodeTrusted1});
        });
        
        it(printTitle('registeredNodeTrusted1', 'creates a proposal to leave the DAO and receive their RPL bond refund, proposal is denied as it would be under the min members required for the DAO'), async () => {
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting('proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting('proposal.execute.blocks', proposalVoteExecuteBlocks, { from: owner });
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalLeave', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}]},
                [registeredNodeTrusted1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can I please leave the DAO?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID)-blockCurrent)+1);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted2 });
            // Fast forward to this voting period finishing
            await mineBlocks(web3, (await getDAOProposalEndBlock(proposalID)-blockCurrent)+1);
            // Proposal should be successful, lets execute it
            await shouldRevert(daoNodeTrustedExecute(proposalID, { from: registeredNode2 }), 'Member proposal successful to leave DAO when they shouldnt be able too', 'Member count will fall below min required, this member must choose to be replaced');
        });


       it(printTitle('registeredNodeTrusted1', 'creates a proposal to replace themselves with registeredNode2 in the DAO, it is successful and registeredNode2 becomes a member and takes over their RPL bond'), async () => {
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            let proposalActionBlocks = 2; 
            // Current member to be replaced
            let currentMember = registeredNodeTrusted1;
            // New member to replace current member
            let newMember = registeredNode2;
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting('proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting('proposal.execute.blocks', proposalVoteExecuteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting('proposal.action.blocks', proposalActionBlocks, { from: owner });
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalReplace', type: 'function', inputs: [{type: 'address', name: '_memberNodeAddress'}, {type: 'string', name: '_replaceId'},{type: 'string', name: '_replaceEmail'}, {type: 'address', name: '__replaceNodeAddress'}]},
                [currentMember, 'SaaS_Provider_99', 'registeredNode2@sass.com', newMember]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can Id like to be replaced by registeredNode2', proposalCalldata, {
                from: registeredNodeTrusted2
            });
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID)-blockCurrent)+1);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted2 });
            // Fast forward to this voting period finishing
            await mineBlocks(web3, (await getDAOProposalEndBlock(proposalID)-blockCurrent)+1);
            // Proposal should be successful, lets execute it
            await daoNodeTrustedExecute(proposalID, { from: registeredNodeTrusted2 });
            // Member can now be replaced
            await daoNodeTrustedMemberReplace(newMember, {from: currentMember});
        });

    
        it(printTitle('registeredNodeTrusted1', 'creates a proposal to kick registeredNodeTrusted2 with a 50% fine, it is successful and registeredNodeTrusted2 is kicked and receives 50% of their bond'), async () => {
            // Get the DAO settings
            const daoNode = await RocketDAONodeTrusted.deployed();
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting('proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting('proposal.execute.blocks', proposalVoteExecuteBlocks, { from: owner });
            // Add our 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool', 'node@home.com');
            // How much bond has registeredNodeTrusted2 paid?
            let registeredNodeTrusted2BondAmount = await daoNode.getMemberRPLBondAmount.call(registeredNodeTrusted2);
            // How much to fine? 33%
            let registeredNodeTrusted2BondAmountFine = registeredNodeTrusted2BondAmount.div(web3.utils.toBN(3));
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalKick', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}, {type: 'uint256', name: '_rplFine'}]},
                [registeredNodeTrusted2, registeredNodeTrusted2BondAmountFine]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, this member hasn\'t logged on for weeks, lets boot them with a 33% fine!', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID)-blockCurrent)+1);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNode1 });
            await daoNodeTrustedVote(proposalID, false, { from: registeredNodeTrusted2 });   // Don't kick me
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            // Proposal has passed, lets execute it now
            await daoNodeTrustedExecute(proposalID, { from: registeredNode1 });
            // Member should be kicked now, let's check their RPL balance has their 33% bond returned
            let rplBalance = await rocketTokenRPL.balanceOf.call(registeredNodeTrusted2);
            //console.log(web3.utils.fromWei(await rocketTokenRPL.balanceOf.call(registeredNodeTrusted2)));
            assert((registeredNodeTrusted2BondAmount.sub(registeredNodeTrusted2BondAmountFine)).eq(rplBalance), "registeredNodeTrusted2 remaining RPL balance is incorrect");
            assert(await getDAOMemberIsValid(registeredNodeTrusted2) === false, "registeredNodeTrusted2 is still a member of the DAO");
        });
        

        it(printTitle('registeredNode2', 'is made a new member after a proposal is created, they fail to vote on that proposal'), async () => {
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting('proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting('proposal.execute.blocks', proposalVoteExecuteBlocks, { from: owner });
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalLeave', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}]},
                [registeredNodeTrusted1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can I please leave the DAO?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Register new member now
            await bootstrapMemberAdd(registeredNode2, 'rocketpool', 'node@home.com');
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID)-blockCurrent)+1);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            // New member attempts to vote on proposal started before they joined, fails
            await shouldRevert(daoNodeTrustedVote(proposalID, true, { from: registeredNode2 }), 'Member voted on proposal they shouldn\'t be able too', 'Member cannot vote on proposal created before they became a member');
        });
        

        it(printTitle('registeredNodeTrusted2', 'fails to execute a successful proposal after it expires'), async () => {
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting('proposal.vote.blocks', proposalVoteBlocks, { from: owner });
            await setDAONodeTrustedBootstrapSetting('proposal.execute.blocks', proposalVoteExecuteBlocks, { from: owner });
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalLeave', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}]},
                [registeredNodeTrusted1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can I please leave the DAO?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID)-blockCurrent)+1);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted2 });
            // Fast forward to this voting period finishing and executing period expiring
            await mineBlocks(web3, (await getDAOProposalEndBlock(proposalID)-blockCurrent)+1+proposalVoteExecuteBlocks);
            // Execution should fail
            await shouldRevert(daoNodeTrustedExecute(proposalID, { from: registeredNode2 }), 'Member execute proposal after it had expired', 'Proposal has not succeeded, has expired or has already been executed');

        });    
        

    });
}
