import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { compressABI } from '../_utils/contract';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { mintDummyRPL } from '../token/scenario-rpl-mint-fixed';
import { burnFixedRPL } from '../token/scenario-rpl-burn-fixed';
import { allowDummyRPL } from '../token/scenario-rpl-allow-fixed';
import { setDaoNodeTrustedBootstrapMember, setDAONodeTrustedBootstrapSetting, setDaoNodeTrustedBootstrapModeDisabled, setDaoNodeTrustedBootstrapUpgrade, setDaoNodeTrustedMemberRequired } from './scenario-dao-node-trusted-bootstrap';
import { daoNodeTrustedExecute, getDAOMemberIsValid, daoNodeTrustedPropose, daoNodeTrustedVote, daoNodeTrustedCancel, daoNodeTrustedMemberJoin, daoNodeTrustedMemberLeave, daoNodeTrustedMemberReplace, daoNodeTrustedMemberChallengeMake, daoNodeTrustedMemberChallengeDecide } from './scenario-dao-node-trusted';
import { proposalStates, getDAOProposalState, getDAOProposalStartBlock, getDAOProposalEndBlock } from './scenario-dao-proposal';

// Contracts
import { RocketDAONodeTrusted, RocketDAONodeTrustedActions, RocketDAONodeTrustedSettingsMembers, RocketDAONodeTrustedSettingsProposals, RocketTokenRPL, RocketMinipoolManager, RocketDAONodeTrustedUpgrade, RocketStorage } from '../_utils/artifacts'; 


export default function() {
    contract('RocketDAONodeTrusted', async (accounts) => {


        // Accounts
        const [
            guardian,
            userOne,
            registeredNode1,
            registeredNode2,
            registeredNodeTrusted1,
            registeredNodeTrusted2,
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
            await mintDummyRPL(_account, _amount, { from: guardian });
            // Mint a large amount of dummy RPL to guardian, who then burns it for real RPL which is sent to nodes for testing below
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
            // Use helper now
            await setNodeTrusted(_account, _id, _email, guardian);
        }

        // Setup

        let rocketMinipoolManagerNew;
        let rocketDAONodeTrustedUpgradeNew;

        before(async () => {
            // Load contracts
            // Get RocketStorage
            const rocketStorage = await RocketStorage.deployed();

            // Register nodes
            await registerNode({from: registeredNode1});
            await registerNode({from: registeredNode2});
            await registerNode({from: registeredNodeTrusted1});
            await registerNode({from: registeredNodeTrusted2});
            // Add members to the DAO now
            await bootstrapMemberAdd(registeredNodeTrusted1, 'rocketpool_1', 'node@home.com');
            await bootstrapMemberAdd(registeredNodeTrusted2, 'rocketpool_2', 'node@home.com');
            // Deploy new contracts
            rocketMinipoolManagerNew = await RocketMinipoolManager.new(rocketStorage.address, {from: guardian});
            rocketDAONodeTrustedUpgradeNew = await RocketDAONodeTrustedUpgrade.new(rocketStorage.address, {from: guardian});
            // Set a small proposal cooldown
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.cooldown', 10, { from: guardian });

        });


        //
        // Start Tests
        //
        
        it(printTitle('userOne', 'fails to be added as a trusted node dao member as they are not a registered node'), async () => {
            // Set as trusted dao member via bootstrapping
            await shouldRevert(setDaoNodeTrustedBootstrapMember('rocketpool', 'node@home.com', userOne, {
                from: guardian
            }), 'Non registered node added to trusted node DAO', 'Invalid node');
        });


        it(printTitle('userOne', 'fails to add a bootstrap trusted node DAO member as non guardian'), async () => {
            // Set as trusted dao member via bootstrapping
            await shouldRevert(setDaoNodeTrustedBootstrapMember('rocketpool', 'node@home.com', registeredNode1, {
                from: userOne
            }), 'Non guardian registered node to trusted node DAO', 'Account is not a temporary guardian');
        });

        it(printTitle('guardian', 'cannot add the same member twice'), async () => {
            // Set as trusted dao member via bootstrapping
            await shouldRevert(setDaoNodeTrustedBootstrapMember('rocketpool', 'node@home.com', registeredNodeTrusted2, {
                from: guardian
            }), 'Guardian the same DAO member twice', 'This node is already part of the trusted node DAO');
        });
      

        it(printTitle('guardian', 'updates quorum setting while bootstrap mode is enabled'), async () => {
            // Set as trusted dao member via bootstrapping
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.quorum', web3.utils.toWei('0.55'), {
                from: guardian
            });
        });

        it(printTitle('guardian', 'updates RPL bond setting while bootstrap mode is enabled'), async () => {
            // Set RPL Bond at 10K RPL
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.rplbond', web3.utils.toWei('10000'), {
                from: guardian
            });
        });

        it(printTitle('userOne', 'fails to update RPL bond setting while bootstrap mode is enabled as they are not the guardian'), async () => {
            // Update setting
            await shouldRevert(setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.rplbond', web3.utils.toWei('10000'), {
                from: userOne
            }), 'UserOne changed RPL bond setting', 'Account is not a temporary guardian');
        });
        
        it(printTitle('guardian', 'fails to update setting after bootstrap mode is disabled'), async () => {
            // Disable bootstrap mode
            await setDaoNodeTrustedBootstrapModeDisabled({
                from: guardian
            })
            // Update setting
            await shouldRevert(setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'members.quorum', web3.utils.toWei('0.55'), {
                from: guardian
            }), 'Guardian updated setting after bootstrap mode is disabled', 'Bootstrap mode not engaged');
        });

        it(printTitle('guardian', 'fails to set quorum setting as 0% while bootstrap mode is enabled'), async () => {
            // Update setting
            await shouldRevert(setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.quorum', web3.utils.toWei('0'), {
                from: guardian
            }), 'Guardian changed quorum setting to invalid value', 'Quorum setting must be > 0 & <= 90%');
        });

    
        it(printTitle('guardian', 'fails to set quorum setting above 90% while bootstrap mode is enabled'), async () => {
            // Update setting
            await shouldRevert(setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.quorum', web3.utils.toWei('0.91'), {
                from: guardian
            }), 'Guardian changed quorum setting to invalid value', 'Quorum setting must be > 0 & <= 90%');
        });
        


        it(printTitle('registeredNode1', 'verify trusted node quorum votes required is correct'), async () => {
            // Load contracts
            const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
            const rocketDAONodeTrustedSettings = await RocketDAONodeTrustedSettingsMembers.deployed();
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
            let daoNodesettings = await RocketDAONodeTrustedSettingsMembers.deployed();
            // How much RPL is required for a trusted node bond?
            let rplBondAmount = web3.utils.fromWei(await daoNodesettings.getRPLBond());
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10;
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
            // Disable bootstrap mode
            await setDaoNodeTrustedBootstrapModeDisabled({ from: guardian });
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
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
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
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
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
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
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

        
        it(printTitle('registeredNodeTrusted1', 'creates a proposal for registeredNode1 to join as a new member, then attempts to again for registeredNode2 before cooldown has passed and that fails'), async () => {
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            let proposalCooldownBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_email'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider', 'test@sass.com', registeredNode1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Encode the calldata for the proposal
            let proposalCalldata2 = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite2', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_email'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider2', 'test2@sass.com', registeredNode2]
            );
            // Add the proposal
            await shouldRevert(daoNodeTrustedPropose('hey guys, can we add this other cool SaaS member please?', proposalCalldata2, {
                from: registeredNodeTrusted1
            }), 'Add proposal before cooldown period passed', 'Member has not waited long enough to make another proposal');
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the cooldown period expires and proposal can be made again
            await mineBlocks(web3, blockCurrent+proposalCooldownBlocks);
            // Try again
            await daoNodeTrustedPropose('hey guys, can we add this other cool SaaS member please?', proposalCalldata2, {
                from: registeredNodeTrusted1
            });
        });
        

        it(printTitle('registeredNodeTrusted1', 'creates a proposal for registeredNode1 to join as a new member, registeredNode2 tries to vote on it, but fails as they joined after it was created'), async () => {
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_email'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider', 'test@sass.com', registeredNode1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Now add a new member after that proposal was created
            await bootstrapMemberAdd(registeredNode2, 'rocketpool', 'node@home.com');
            // registeredNodeTrusted1 votes
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            // registeredNode2 vote fails
            await shouldRevert(daoNodeTrustedVote(proposalID, true, { 
                from: registeredNode2 
            }), 'Voted on proposal created before they joined', 'Member cannot vote on proposal created before they became a member');
        });
        
        
        it(printTitle('registeredNodeTrusted1', 'creates a proposal to leave the DAO and receive their RPL bond refund, proposal is denied as it would be under the min members required for the DAO'), async () => {
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
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
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.action.blocks', proposalActionBlocks, { from: guardian });
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
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
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
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
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
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
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

        

        it(printTitle('registeredNodeTrusted1', 'challenges another members node to respond and it does successfully in the window required'), async () => {
            // Add a 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool_3', 'node2@home.com');
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
            // Update our challenge settings
            let challengeWindowBlocks = 10;
            let challengeCooldownBlocks = 10;
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.window', challengeWindowBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.cooldown', challengeCooldownBlocks, { from: guardian });
            // Attempt to challenge a non-member
            await shouldRevert(daoNodeTrustedMemberChallengeMake(registeredNode2, { from: registeredNodeTrusted1 }), 'A non member was challenged', 'Invalid trusted node');
            // Challenge the 3rd member
            await daoNodeTrustedMemberChallengeMake(registeredNode1, { from: registeredNodeTrusted1 });
            // Attempt to challenge again 
            await shouldRevert(daoNodeTrustedMemberChallengeMake(registeredNode1, { from: registeredNodeTrusted1 }), 'Member was challenged again', 'Member is already being challenged');
            // Attempt to challenge another member before cooldown has passed 
            await shouldRevert(daoNodeTrustedMemberChallengeMake(registeredNodeTrusted2, { from: registeredNodeTrusted1 }), 'Member challenged another user before cooldown had passed', 'You must wait for the challenge cooldown to pass before issuing another challenge');
            // Have 3rd member respond to the challenge successfully 
            await daoNodeTrustedMemberChallengeDecide(registeredNode1, true, { from: registeredNode1 });
            // Wait until the original iniators cooldown window has passed and they attempt another challenge
            await mineBlocks(web3, challengeCooldownBlocks);
            await daoNodeTrustedMemberChallengeMake(registeredNode1, { from: registeredNodeTrusted1 });
            // Fast forward to past the challenge window with the challenged node responding
            await mineBlocks(web3, challengeWindowBlocks);
            // Have 3rd member respond to the challenge successfully again, but after the challenge window has expired and before another member decides it
            await daoNodeTrustedMemberChallengeDecide(registeredNode1, true, { from: registeredNode1 });
        });

        
        it(printTitle('registeredNodeTrusted1', 'challenges another members node to respond, they do not in the window required and lose their membership + bond'), async () => {
            // Add a 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool_3', 'node2@home.com');
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
            // Update our challenge settings
            let challengeWindowBlocks = 10;
            let challengeCooldownBlocks = 10;
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.window', challengeWindowBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.cooldown', challengeCooldownBlocks, { from: guardian });
            // Try to challenge yourself
            await shouldRevert(daoNodeTrustedMemberChallengeMake(registeredNode1, { from: registeredNode1 }), 'Member challenged themselves', 'You cannot challenge yourself');
            // Challenge the 3rd member
            await daoNodeTrustedMemberChallengeMake(registeredNode1, { from: registeredNodeTrusted1 });
            // Have the original iniator member try to decide the result
            await shouldRevert(daoNodeTrustedMemberChallengeDecide(registeredNode1, true, { from: registeredNodeTrusted1 }), 'Member who initiated challenge was able to attempt the decision', 'Challenge cannot be decided by the original initiator, must be another node');
            // Attempt to decide a challenge on a member that hasn't been challenged
            await shouldRevert(daoNodeTrustedMemberChallengeDecide(registeredNodeTrusted2, true, { from: registeredNodeTrusted1 }), 'Member decided challenge on member without a challenge', 'Member hasn\'t been challenged or they have successfully responded to the challenge already');
            // Have another member try to decide the result before the window passes, it shouldn't change and they should still be a member
            await daoNodeTrustedMemberChallengeDecide(registeredNode1, true, { from: registeredNodeTrusted2 });
            // Fast forward to past the challenge window with the challenged node responding
            await mineBlocks(web3, challengeWindowBlocks);
            // Decide the challenge now after the node hasn't responded in the challenge window
            await daoNodeTrustedMemberChallengeDecide(registeredNode1, false, { from: registeredNodeTrusted2 });
        });

        

        it(printTitle('registeredNode2', 'as a regular node challenges a DAO members node to respond by paying ETH, they do not respond in the window required and lose their membership + bond'), async () => {
            // Get the DAO settings
            let daoNodesettings = await RocketDAONodeTrustedSettingsMembers.deployed();
            // How much ETH is required for a regular node to challenge a DAO member
            let challengeCost = await daoNodesettings.getChallengeCost();
            // Add a 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool_3', 'node2@home.com');
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
            // Update our challenge settings
            let challengeWindowBlocks = 10;
            let challengeCooldownBlocks = 10;
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.window', challengeWindowBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.cooldown', challengeCooldownBlocks, { from: guardian });
            // Attempt to challenge a non member
            await shouldRevert(daoNodeTrustedMemberChallengeMake(userOne, {
                from: registeredNode2 
            }), 'Challenged a non DAO member', 'Invalid trusted node');
            // Attempt to challenge as a non member
            await shouldRevert(daoNodeTrustedMemberChallengeMake(registeredNodeTrusted2, {
                from: userOne 
            }), 'Challenged a non DAO member', 'Invalid node');
            // Challenge the 3rd member as a regular node, should revert as we haven't paid to challenge
            await shouldRevert(daoNodeTrustedMemberChallengeMake(registeredNode1, {
                from: registeredNode2 
            }), 'Regular node challenged DAO member without paying challenge fee', 'Non DAO members must pay ETH to challenge a members node');
            // Ok pay now to challenge
            await daoNodeTrustedMemberChallengeMake(registeredNode1, { 
                value: challengeCost,
                from: registeredNode2 
            });
            // Fast forward to past the challenge window with the challenged node responding
            await mineBlocks(web3, challengeWindowBlocks);
            // Decide the challenge now after the node hasn't responded in the challenge window
            await daoNodeTrustedMemberChallengeDecide(registeredNode1, false, { from: registeredNodeTrusted2 });
        });

        
        it(printTitle('registered2', 'joins the DAO automatically as a member due to the min number of members falling below the min required'), async () => {
            // Attempt to join as a non node operator
            await shouldRevert(setDaoNodeTrustedMemberRequired('rocketpool_emergency_node_op', 'node2@home.com', { 
                from: userOne 
            }), 'Regular node joined DAO without bond during low member mode', 'Invalid node');
            // Attempt to join without setting allowance for the bond
            await shouldRevert(setDaoNodeTrustedMemberRequired('rocketpool_emergency_node_op', 'node2@home.com', { 
                from: registeredNode2 
            }), 'Regular node joined DAO without bond during low member mode', 'Not enough allowance given to RocketDAONodeTrusted contract for transfer of RPL bond tokens');
            // Get the DAO settings
            let daoNodesettings = await RocketDAONodeTrustedSettingsMembers.deployed();
            // How much RPL is required for a trusted node bond?
            let rplBondAmount = web3.utils.fromWei(await daoNodesettings.getRPLBond());
            // We'll allow the DAO to transfer our RPL bond before joining
            await rplMint(registeredNode2, rplBondAmount);
            await rplAllowanceDAO(registeredNode2, rplBondAmount);
            // Should just be 2 nodes in the DAO now which means a 3rd can join to make up the min count
            await setDaoNodeTrustedMemberRequired('rocketpool_emergency_node_op', 'node2@home.com', {
                from: registeredNode2,
            });
        });

        
        it(printTitle('registered2', 'attempt to auto join the DAO automatically and fails as the DAO has the min member count required'), async () => {
            // Add a 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool_3', 'node2@home.com');
            // Get the DAO settings
            let daoNodesettings = await RocketDAONodeTrustedSettingsMembers.deployed();
            // How much RPL is required for a trusted node bond?
            let rplBondAmount = web3.utils.fromWei(await daoNodesettings.getRPLBond());
            // We'll allow the DAO to transfer our RPL bond before joining
            await rplMint(registeredNode2, rplBondAmount);
            await rplAllowanceDAO(registeredNode2, rplBondAmount);
            // Should just be 2 nodes in the DAO now which means a 3rd can join to make up the min count
            await shouldRevert(setDaoNodeTrustedMemberRequired('rocketpool_emergency_node_op', 'node2@home.com', {
                from: registeredNode2,
            }), 'Regular node joined DAO when not in low member mode', 'Low member mode not engaged');
        });

        /*** Upgrade Contacts & ABI *************/

        // Contracts
        it(printTitle('guardian', 'can upgrade a contract in bootstrap mode'), async () => {
            await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketNodeManager', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: guardian,
            });
        });

        it(printTitle('guardian', 'can upgrade the upgrade contract'), async () => {
            await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketDAONodeTrustedUpgrade', rocketDAONodeTrustedUpgradeNew.abi, rocketDAONodeTrustedUpgradeNew.address, {
                from: guardian,
            });
        });

        it(printTitle('userOne', 'cannot upgrade a contract in bootstrap mode'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketNodeManager', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: userOne,
            }), 'Random address upgraded a contract', 'Account is not a temporary guardian');
        });

        it(printTitle('guardian', 'cannot upgrade a contract with an invalid address'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketNodeManager', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: guardian,
            }), 'Guardian adupgradedded a contract with an invalid address', 'Invalid contract address');
        });

        it(printTitle('guardian', 'cannot upgrade a protected contract'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketVault', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: guardian,
            }), 'Upgraded a protected contract', 'Cannot upgrade the vault');
        });

        it(printTitle('guardian', 'can add a contract in bootstrap mode'), async () => {
            await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketMinipoolManagerNew', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: guardian,
            });
        });

        it(printTitle('guardian', 'cannot add a contract with the same name as an existing one'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketStorage', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: guardian,
            }), 'Guardian added a contract with the same name as an existing one', 'Contract name is already in use');
        });

        it(printTitle('guardian', 'cannot add a contract with an existing address'), async () => {
            const rocketStorage = await RocketStorage.deployed();
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketNewContract', rocketMinipoolManagerNew.abi, rocketStorage.address, {
                from: guardian,
            }), 'Guardian added a contract with the same address as an existing one', 'Contract address is already in use');
        });

        it(printTitle('guardian', 'cannot add a new contract with an invalid name'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('addContract', '', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: guardian,
            }), 'Added a new contract with an invalid name', 'Invalid contract name');
        });

        it(printTitle('registeredNodeTrusted1', 'creates a proposal to upgrade a network contract, it passees and is executed'), async () => {
            // Load contracts
            const rocketStorage = await RocketStorage.deployed();
            // Setup our proposal settings
            let proposalVoteBlocks = 10;
            let proposalVoteExecuteBlocks = 10; 
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.blocks', proposalVoteBlocks, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.execute.blocks', proposalVoteExecuteBlocks, { from: guardian });
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalUpgrade', type: 'function', inputs: [{type: 'string',  name: '_type'},{type: 'string', name: '_name'},{type: 'string', name: '_contractAbi'},{type: 'address', name: '_contractAddress'}]},
                ['upgradeContract', 'rocketNodeManager', compressABI(rocketMinipoolManagerNew.abi), rocketMinipoolManagerNew.address]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, we really should upgrade this contracts - here\'s a link to its audit reports https://link.com/audit', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Now mine blocks until the proposal is 'active' and can be voted on
            await mineBlocks(web3, (await getDAOProposalStartBlock(proposalID)-blockCurrent)+1);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted2 });
            // Proposal has passed, lets execute it now and upgrade the contract
            await daoNodeTrustedExecute(proposalID, { from: registeredNode1 });
            // Lets check if the address matches the upgraded one now
            assert.equal(await rocketStorage.getAddress.call(web3.utils.soliditySha3('contract.address', 'rocketNodeManager')), rocketMinipoolManagerNew.address, 'Contract address was not successfully upgraded');
            assert.isTrue(await rocketStorage.getBool.call(web3.utils.soliditySha3('contract.exists', rocketMinipoolManagerNew.address)), 'Contract address was not successfully upgraded');
        });


        // ABIs - contract address field is ignored
        it(printTitle('guardian', 'can upgrade a contract ABI in bootstrap mode'), async () => {
            await setDaoNodeTrustedBootstrapUpgrade('upgradeABI', 'rocketNodeManager', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: guardian,
            });
        });

        it(printTitle('guardian', 'cannot upgrade a contract ABI which does not exist'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeABI', 'fooBarBaz', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: guardian,
            }), 'Upgraded a contract ABI which did not exist', 'ABI does not exist');
        });

        it(printTitle('userOne', 'cannot upgrade a contract ABI'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeABI', 'rocketNodeManager', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: userOne,
            }), 'Random address upgraded a contract ABI', 'Account is not a temporary guardian');
        });

        it(printTitle('guardian', 'can add a contract ABI in bootstrap mode'), async () => {
            await setDaoNodeTrustedBootstrapUpgrade('addABI', 'rocketNewFeature', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: guardian,
            });
        });

        it(printTitle('guardian', 'cannot add a new contract ABI with an invalid name'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('addABI', '', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: guardian,
            }), 'Added a new contract ABI with an invalid name', 'Invalid ABI name');
        });

        it(printTitle('guardian', 'cannot add a new contract ABI with an existing name'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('addABI', 'rocketNodeManager', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: guardian,
            }), 'Added a new contract ABI with an existing name', 'ABI name is already in use');
        });

        it(printTitle('userOne', 'cannot add a new contract ABI'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('addABI', 'rocketNewFeature', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: userOne,
            }), 'Random address added a new contract ABI', 'Account is not a temporary guardian');
        });
        
    });
}
