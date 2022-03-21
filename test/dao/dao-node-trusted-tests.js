import { increaseTime, getCurrentTime } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { compressABI } from '../_utils/contract';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { mintDummyRPL } from '../token/scenario-rpl-mint-fixed';
import { burnFixedRPL } from '../token/scenario-rpl-burn-fixed';
import { allowDummyRPL } from '../token/scenario-rpl-allow-fixed';
import { setDaoNodeTrustedBootstrapMember, setDAONodeTrustedBootstrapSetting, setDaoNodeTrustedBootstrapModeDisabled, setDaoNodeTrustedBootstrapUpgrade, setDaoNodeTrustedMemberRequired } from './scenario-dao-node-trusted-bootstrap';
import { daoNodeTrustedExecute, getDAOMemberIsValid, daoNodeTrustedPropose, daoNodeTrustedVote, daoNodeTrustedCancel, daoNodeTrustedMemberJoin, daoNodeTrustedMemberLeave, daoNodeTrustedMemberChallengeMake, daoNodeTrustedMemberChallengeDecide } from './scenario-dao-node-trusted';
import { proposalStates, getDAOProposalState, getDAOProposalStartTime, getDAOProposalEndTime, getDAOProposalExpires } from './scenario-dao-proposal';

// Contracts
import { RocketDAONodeTrusted, RocketDAONodeTrustedActions, RocketDAONodeTrustedSettingsMembers, RocketDAONodeTrustedSettingsProposals, GoGoTokenGGP, RocketMinipoolManager, RocketDAONodeTrustedUpgrade, RocketStorage } from '../_utils/artifacts'; 


export default function() {
    contract('RocketDAONodeTrusted', async (accounts) => {


        // Accounts
        const [
            guardian,
            userOne,
            registeredNode1,
            registeredNode2,
            registeredNode3,
            registeredNodeTrusted1,
            registeredNodeTrusted2,
            registeredNodeTrusted3,
        ] = accounts;


        // Mints fixed supply RPL, burns that for new RPL and gives it to the account
        let rplMint = async function(_account, _amount) {
            // Load contracts
            const gogoTokenGGP = await GoGoTokenGGP.deployed();
            
            // Convert
            _amount = web3.utils.toWei(_amount.toString(), 'ether');
            // Mint RPL fixed supply for the users to simulate current users having RPL
            await mintDummyRPL(_account, _amount, { from: guardian });
            // Mint a large amount of dummy RPL to guardian, who then burns it for real RPL which is sent to nodes for testing below
            await allowDummyRPL(gogoTokenGGP.address, _amount, { from: _account });
            // Burn existing fixed supply RPL for new RPL
            await burnFixedRPL(_amount, { from: _account }); 

        }

        // Allow the given account to spend this users RPL
        let rplAllowanceDAO = async function(_account, _amount) {
            // Load contracts
            const gogoTokenGGP = await GoGoTokenGGP.deployed();
            const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed();
            // Convert
            _amount = web3.utils.toWei(_amount.toString(), 'ether');
            // Approve now
            await gogoTokenGGP.approve(rocketDAONodeTrustedActions.address, _amount, { from: _account });
        }

        // Add a new DAO member via bootstrap mode
        let bootstrapMemberAdd = async function(_account, _id, _url) {
            // Use helper now
            await setNodeTrusted(_account, _id, _url, guardian);
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
            await registerNode({from: registeredNode3});
            await registerNode({from: registeredNodeTrusted1});
            await registerNode({from: registeredNodeTrusted2});
            await registerNode({from: registeredNodeTrusted3});
            // Add members to the DAO now
            await bootstrapMemberAdd(registeredNodeTrusted1, 'rocketpool_1', 'node@home.com');
            await bootstrapMemberAdd(registeredNodeTrusted2, 'rocketpool_2', 'node@home.com');
            // Deploy new contracts
            rocketMinipoolManagerNew = await RocketMinipoolManager.new(rocketStorage.address, {from: guardian});
            rocketDAONodeTrustedUpgradeNew = await RocketDAONodeTrustedUpgrade.new(rocketStorage.address, {from: guardian});
            // Set a small proposal cooldown
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.cooldown', 10, { from: guardian });
            // Set a small vote delay
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.vote.delay.blocks', 4, { from: guardian });

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
            // Disable bootstrap mode
            await setDaoNodeTrustedBootstrapModeDisabled({ from: guardian });
            // We only have 2 members now that bootstrap mode is disabled and proposals can only be made with 3, lets get a regular node to join via the emergency method
            // We'll allow the DAO to transfer our RPL bond before joining
            await rplMint(registeredNode3, rplBondAmount);
            await rplAllowanceDAO(registeredNode3, rplBondAmount);
            await setDaoNodeTrustedMemberRequired('rocketpool_emergency_node_op', 'node3@home.com', {
                from: registeredNode3,
            });
            // New Member 1
            // Encode the calldata for the proposal
            let proposalCalldata1 = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_url'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider1', 'test@sass.com', registeredNode1]
            );
            // Add the proposal
            let proposalID_1 = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata1, {
                from: registeredNodeTrusted1
            });
            // New Member 2
            // Encode the calldata for the proposal
            let proposalCalldata2 = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_url'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider2', 'test2@sass.com', registeredNode2]
            );
            // Add the proposal
            let proposalID_2 = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata2, {
                from: registeredNodeTrusted2
            });
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID_1)-timeCurrent)+2);
            // Now lets vote for the new members
            await daoNodeTrustedVote(proposalID_1, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID_1, true, { from: registeredNodeTrusted2 });
            await daoNodeTrustedVote(proposalID_2, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID_2, true, { from: registeredNodeTrusted2 });
            // Current time
            timeCurrent = await getCurrentTime(web3);
            // Fast forward to voting periods finishing
            await increaseTime(web3, (await getDAOProposalEndTime(proposalID_1)-timeCurrent)+2);
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
            // Add a small wait between member join and proposal
            await increaseTime(web3, 2);
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
            // Current time
            timeCurrent = await getCurrentTime(web3);
            // Now mine blocks until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID_3)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalID_3, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID_3, true, { from: registeredNodeTrusted2 });
            await daoNodeTrustedVote(proposalID_3, false, { from: registeredNode1 });
            await daoNodeTrustedVote(proposalID_3, true, { from: registeredNode2 });
            // Current time
            timeCurrent = await getCurrentTime(web3);
            // Fast forward to this voting period finishing
            await increaseTime(web3, (await getDAOProposalEndTime(proposalID_3)-timeCurrent)+2);
            // Proposal should be successful, lets execute it
            await daoNodeTrustedExecute(proposalID_3, { from: registeredNodeTrusted2 });
            // Member can now leave and collect any RPL bond
            await daoNodeTrustedMemberLeave(registeredNodeTrusted2, {from: registeredNodeTrusted2});

        });
                
        // Test various proposal states
        it(printTitle('registeredNodeTrusted1', 'creates a proposal and verifies the proposal states as it passes and is executed'), async () => {
            // Add our 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool', 'node@home.com');
            await increaseTime(web3, 60);
            // Now registeredNodeTrusted2 wants to leave
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_url'}, {type: 'address', name: '_nodeAddress'}]},
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
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
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
            // Add our 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool', 'node@home.com');
            await increaseTime(web3, 60);
            // Now registeredNodeTrusted2 wants to leave
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_url'}, {type: 'address', name: '_nodeAddress'}]},
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
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNode1 });
            await daoNodeTrustedVote(proposalID, false, { from: registeredNodeTrusted2 });   
            await daoNodeTrustedVote(proposalID, false, { from: registeredNodeTrusted1 });
            // Fast forward to this voting period finishing
            await increaseTime(web3, (await getDAOProposalEndTime(proposalID)-timeCurrent)+2);
            // Verify the proposal is defeated
            assert(await getDAOProposalState(proposalID) == proposalStates.Defeated, 'Proposal state is not defeated');
            // Proposal has failed, can we execute it anyway?
            await shouldRevert(daoNodeTrustedExecute(proposalID, { from: registeredNode1 }), 'Executed defeated proposal', 'Proposal has not succeeded, has expired or has already been executed');;
        });
        
        
        it(printTitle('registeredNodeTrusted1', 'creates a proposal for registeredNode1 to join as a new member but cancels it before it passes'), async () => {
            // Add our 3rd member so proposals can pass
            await bootstrapMemberAdd(registeredNodeTrusted3, 'rocketpool_3', 'node3@home.com');
            await increaseTime(web3, 60);
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_url'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider', 'test@sass.com', registeredNode1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            // Cancel now before it passes
            await daoNodeTrustedCancel(proposalID, {from: registeredNodeTrusted1});
        });

        
        it(printTitle('registeredNodeTrusted1', 'creates a proposal for registeredNode1 to join as a new member, then attempts to again for registeredNode2 before cooldown has passed and that fails'), async () => {
            // Add our 3rd member so proposals can pass
            await bootstrapMemberAdd(registeredNodeTrusted3, 'rocketpool_3', 'node3@home.com');
            await increaseTime(web3, 60);
            // Setup our proposal settings
            let proposalCooldownTime = 60 * 60;
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsProposals, 'proposal.cooldown.time', proposalCooldownTime, { from: guardian });
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_url'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider', 'test@sass.com', registeredNode1]
            );
            // Add the proposal
            await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Encode the calldata for the proposal
            let proposalCalldata2 = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite2', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_url'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider2', 'test2@sass.com', registeredNode2]
            );
            // Add the proposal
            await shouldRevert(daoNodeTrustedPropose('hey guys, can we add this other cool SaaS member please?', proposalCalldata2, {
                from: registeredNodeTrusted1
            }), 'Add proposal before cooldown period passed', 'Member has not waited long enough to make another proposal');
            // Current block
            let timeCurrent = await getCurrentTime(web3);
            // Now wait until the cooldown period expires and proposal can be made again
            await increaseTime(web3, timeCurrent + proposalCooldownTime + 2);
            // Try again
            await daoNodeTrustedPropose('hey guys, can we add this other cool SaaS member please?', proposalCalldata2, {
                from: registeredNodeTrusted1
            });
        });
        

        it(printTitle('registeredNodeTrusted1', 'creates a proposal for registeredNode1 to join as a new member, registeredNode2 tries to vote on it, but fails as they joined after it was created'), async () => {
            // Add our 3rd member so proposals can pass
            await bootstrapMemberAdd(registeredNodeTrusted3, 'rocketpool_3', 'node3@home.com');
            await increaseTime(web3, 60);
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_url'}, {type: 'address', name: '_nodeAddress'}]},
                ['SaaS_Provider', 'test@sass.com', registeredNode1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Now add a new member after that proposal was created
            await bootstrapMemberAdd(registeredNode2, 'rocketpool', 'node@home.com');
            // Current block
            let timeCurrent = await getCurrentTime(web3);
            // Now wait until the cooldown period expires and proposal can be made again
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
            // registeredNodeTrusted1 votes
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            // registeredNode2 vote fails
            await shouldRevert(daoNodeTrustedVote(proposalID, true, { 
                from: registeredNode2 
            }), 'Voted on proposal created before they joined', 'Member cannot vote on proposal created before they became a member');
        });
        
        
        it(printTitle('registeredNodeTrusted1', 'creates a proposal to leave the DAO and receive their RPL bond refund, proposal is denied as it would be under the min members required for the DAO'), async () => {
            // Add our 3rd member so proposals can pass
            await bootstrapMemberAdd(registeredNodeTrusted3, 'rocketpool_3', 'node3@home.com');
            await increaseTime(web3, 60);
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalLeave', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}]},
                [registeredNodeTrusted1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can I please leave the DAO?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted2 });
            // Fast forward to this voting period finishing
            await increaseTime(web3, (await getDAOProposalEndTime(proposalID)-timeCurrent)+2);
            // Proposal should be successful, lets execute it
            await shouldRevert(daoNodeTrustedExecute(proposalID, { from: registeredNode2 }), 'Member proposal successful to leave DAO when they shouldnt be able too', 'Member count will fall below min required');
        });



        it(printTitle('registeredNodeTrusted1', 'creates a proposal to kick registeredNodeTrusted2 with a 50% fine, it is successful and registeredNodeTrusted2 is kicked and receives 50% of their bond'), async () => {
            // Add our 3rd member so proposals can pass
            await bootstrapMemberAdd(registeredNodeTrusted3, 'rocketpool_3', 'node3@home.com');
            await increaseTime(web3, 60);
            // Get the DAO settings
            const daoNode = await RocketDAONodeTrusted.deployed();
            const gogoTokenGGP = await GoGoTokenGGP.deployed();
            // Add our 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool', 'node@home.com');
            await increaseTime(web3, 60);
            // How much bond has registeredNodeTrusted2 paid?
            let registeredNodeTrusted2BondAmount = await daoNode.getMemberRPLBondAmount.call(registeredNodeTrusted2);
            // How much to fine? 33%
            let registeredNodeTrusted2BondAmountFine = registeredNodeTrusted2BondAmount.div(web3.utils.toBN(3));
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
              {name: 'proposalKick', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}, {type: 'uint256', name: '_rplFine'}]},
              [registeredNodeTrusted2, registeredNodeTrusted2BondAmountFine]
            );
            // Get the RPL total supply
            let rplTotalSupply1 = await gogoTokenGGP.totalSupply.call()
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, this member hasn\'t logged on for weeks, lets boot them with a 33% fine!', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNode1 });
            await daoNodeTrustedVote(proposalID, false, { from: registeredNodeTrusted2 });   // Don't kick me
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted3 });
            // Proposal has passed, lets execute it now
            await daoNodeTrustedExecute(proposalID, { from: registeredNode1 });
            // Member should be kicked now, let's check their RPL balance has their 33% bond returned
            let rplBalance = await gogoTokenGGP.balanceOf.call(registeredNodeTrusted2);
            //console.log(web3.utils.fromWei(await gogoTokenGGP.balanceOf.call(registeredNodeTrusted2)));
            assert((registeredNodeTrusted2BondAmount.sub(registeredNodeTrusted2BondAmountFine)).eq(rplBalance), "registeredNodeTrusted2 remaining RPL balance is incorrect");
            assert(await getDAOMemberIsValid(registeredNodeTrusted2) === false, "registeredNodeTrusted2 is still a member of the DAO");
            // The 33% fine should be burned
            let rplTotalSupply2 = await gogoTokenGGP.totalSupply.call()
            assert(rplTotalSupply1.sub(rplTotalSupply2).eq(registeredNodeTrusted2BondAmountFine), "RPL total supply did not decrease by fine amount");
        });


        it(printTitle('registeredNode2', 'is made a new member after a proposal is created, they fail to vote on that proposal'), async () => {
            // Add our 3rd member so proposals can pass
            await bootstrapMemberAdd(registeredNodeTrusted3, 'rocketpool_3', 'node3@home.com');
            await increaseTime(web3, 60);
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
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            // New member attempts to vote on proposal started before they joined, fails
            await shouldRevert(daoNodeTrustedVote(proposalID, true, { from: registeredNode2 }), 'Member voted on proposal they shouldn\'t be able too', 'Member cannot vote on proposal created before they became a member');
        });
        

        it(printTitle('registeredNodeTrusted2', 'fails to execute a successful proposal after it expires'), async () => {
            // Add our 3rd member so proposals can pass
            await bootstrapMemberAdd(registeredNodeTrusted3, 'rocketpool_3', 'node3@home.com');
            await increaseTime(web3, 60);
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalLeave', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}]},
                [registeredNodeTrusted1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can I please leave the DAO?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted2 });
            // Fast forward to this voting period finishing and executing period expiring
            await increaseTime(web3, (await getDAOProposalExpires(proposalID)-timeCurrent)+2);
            // Verify correct expired status
            assert(await getDAOProposalState(proposalID) == proposalStates.Expired, 'Proposal state is not Expired');
            // Execution should fail
            await shouldRevert(daoNodeTrustedExecute(proposalID, { from: registeredNode2 }), 'Member execute proposal after it had expired', 'Proposal has not succeeded, has expired or has already been executed');
        });    


        it(printTitle('registeredNodeTrusted2', 'checks to see if a proposal has expired after being successfully voted for, but not executed'), async () => {
            // Add our 3rd member so proposals can pass
            await bootstrapMemberAdd(registeredNodeTrusted3, 'rocketpool_3', 'node3@home.com');
            await increaseTime(web3, 60);
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalLeave', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}]},
                [registeredNodeTrusted1]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, can I please leave the DAO?', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted2 });
            // Fast forward to this voting period finishing and executing period expiring
            await increaseTime(web3, (await getDAOProposalExpires(proposalID)-timeCurrent)+2);
            // Execution should fail
            await shouldRevert(daoNodeTrustedExecute(proposalID, { from: registeredNode2 }), 'Member execute proposal after it had expired', 'Proposal has not succeeded, has expired or has already been executed');
            // Cancel should fail
            await shouldRevert(daoNodeTrustedCancel(proposalID, { from: registeredNodeTrusted1 }), 'Member cancelled proposal after it had expired', 'Proposal can only be cancelled if pending or active');
        });  

        

        it(printTitle('registeredNodeTrusted1', 'challenges another members node to respond and it does successfully in the window required'), async () => {
            // Add a 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool_3', 'node2@home.com');
            // Update our challenge settings
            let challengeWindowTime = 60 * 60;
            let challengeCooldownTime = 60 * 60;
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.window', challengeWindowTime, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.cooldown', challengeCooldownTime, { from: guardian });
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
            // Wait until the original initiator's cooldown window has passed and they attempt another challenge
            await increaseTime(web3, challengeCooldownTime + 2);
            await daoNodeTrustedMemberChallengeMake(registeredNode1, { from: registeredNodeTrusted1 });
            // Fast forward to past the challenge window with the challenged node responding
            await increaseTime(web3, challengeWindowTime + 2);
            // Have 3rd member respond to the challenge successfully again, but after the challenge window has expired and before another member decides it
            await daoNodeTrustedMemberChallengeDecide(registeredNode1, true, { from: registeredNode1 });
        });
        
        
        it(printTitle('registeredNodeTrusted1', 'challenges another members node to respond, they do not in the window required and lose their membership + bond'), async () => {
            // Add a 3rd member
            await bootstrapMemberAdd(registeredNode1, 'rocketpool_3', 'node2@home.com');
            // Update our challenge settings
            let challengeWindowTime = 60 * 60;
            let challengeCooldownTime = 60 * 60;
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.window', challengeWindowTime, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.cooldown', challengeCooldownTime, { from: guardian });
            // Try to challenge yourself
            await shouldRevert(daoNodeTrustedMemberChallengeMake(registeredNode1, { from: registeredNode1 }), 'Member challenged themselves', 'You cannot challenge yourself');
            // Challenge the 3rd member
            await daoNodeTrustedMemberChallengeMake(registeredNode1, { from: registeredNodeTrusted1 });
            // Attempt to decide a challenge on a member that hasn't been challenged
            await shouldRevert(daoNodeTrustedMemberChallengeDecide(registeredNodeTrusted2, true, { from: registeredNodeTrusted1 }), 'Member decided challenge on member without a challenge', 'Member hasn\'t been challenged or they have successfully responded to the challenge already');
            // Have another member try to decide the result before the window passes, it shouldn't change and they should still be a member
            await shouldRevert(daoNodeTrustedMemberChallengeDecide(registeredNode1, true, { from: registeredNodeTrusted2 }), 'Member decided challenge before refute window passed', 'Refute window has not yet passed');
            // Fast forward to past the challenge window with the challenged node responding
            await increaseTime(web3, challengeWindowTime + 2);
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
            await increaseTime(web3, 60);
            // Update our challenge settings
            let challengeWindowTime = 60 * 60;
            let challengeCooldownTime = 60 * 60;
            // Update now while in bootstrap mode
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.window', challengeWindowTime, { from: guardian });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMembers, 'members.challenge.cooldown', challengeCooldownTime, { from: guardian });
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
            await increaseTime(web3, challengeWindowTime + 2);
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
            }), 'Guardian upgraded a contract with an invalid address', 'Invalid contract address');
        });

        it(printTitle('guardian', 'cannot upgrade a contract with an existing one'), async () => {
            const rocketStorageAddress = (await RocketStorage.deployed()).address
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketNodeManager', [], rocketStorageAddress, {
                from: guardian,
            }), 'Guardian upgraded a contract with an existing contract', 'Contract address is already in use');
        });

        it(printTitle('guardian', 'cannot upgrade a contract with an empty ABI'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketDAONodeTrustedUpgrade', '', rocketDAONodeTrustedUpgradeNew.address, {
                  from: guardian,
              }), 'Guardian upgraded a contract with an empty ABI', 'Empty ABI is invalid');
        });

        it(printTitle('guardian', 'cannot upgrade a protected contract'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketVault', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: guardian,
            }), 'Upgraded a protected contract', 'Cannot upgrade the vault');
            
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'gogoTokenGGPAVAX', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: guardian,
            }), 'Upgraded a protected contract', 'Cannot upgrade token contracts');
            
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'gogoTokenGGP', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: guardian,
            }), 'Upgraded a protected contract', 'Cannot upgrade token contracts');
            
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'gogoTokenGGPFixedSupply', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: guardian,
            }), 'Upgraded a protected contract', 'Cannot upgrade token contracts');

            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'casperDeposit', rocketMinipoolManagerNew.abi, rocketMinipoolManagerNew.address, {
                from: guardian,
            }), 'Upgraded a protected contract', 'Cannot upgrade the casper deposit contract');
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

        it(printTitle('guardian', 'cannot add a new contract with an empty ABI'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketNewContract', '', rocketMinipoolManagerNew.address, {
                from: guardian,
            }), 'Added a new contract with an empty ABI', 'Empty ABI is invalid');
        });

        it(printTitle('registeredNodeTrusted1', 'creates a proposal to upgrade a network contract, it passees and is executed'), async () => {
            // Add our 3rd member so proposals can pass
            await bootstrapMemberAdd(registeredNodeTrusted3, 'rocketpool_3', 'node3@home.com');
            await increaseTime(web3, 60);
            // Load contracts
            const rocketStorage = await RocketStorage.deployed();
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalUpgrade', type: 'function', inputs: [{type: 'string',  name: '_type'},{type: 'string', name: '_name'},{type: 'string', name: '_contractAbi'},{type: 'address', name: '_contractAddress'}]},
                ['upgradeContract', 'rocketNodeManager', compressABI(rocketMinipoolManagerNew.abi), rocketMinipoolManagerNew.address]
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose('hey guys, we really should upgrade this contracts - here\'s a link to its audit reports https://link.com/audit', proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalID, true, { from: registeredNodeTrusted2 });
            // Proposal has passed, lets execute it now and upgrade the contract
            await daoNodeTrustedExecute(proposalID, { from: registeredNode1 });
            // Lets check if the address matches the upgraded one now
            assert.equal(await rocketStorage.getAddress.call(web3.utils.soliditySha3('contract.address', 'rocketNodeManager')), rocketMinipoolManagerNew.address, 'Contract address was not successfully upgraded');
            assert.isTrue(await rocketStorage.getBool.call(web3.utils.soliditySha3('contract.exists', rocketMinipoolManagerNew.address)), 'Contract address was not successfully upgraded');
        });


        it(printTitle('registeredNodeTrusted1', 'creates a proposal for registeredNode1 to join as a new member, member joins, is kicked, then cannot rejoin'), async () => {
            // Get the DAO settings
            let daoNodesettings = await RocketDAONodeTrustedSettingsMembers.deployed();
            // How much RPL is required for a trusted node bond?
            let rplBondAmount = web3.utils.fromWei(await daoNodesettings.getRPLBond());
            // Add our 3rd member so proposals can pass
            await bootstrapMemberAdd(registeredNodeTrusted3, 'rocketpool_3', 'node3@home.com');
            // New Member
            // Encode the calldata for the proposal
            let proposalCalldata1 = web3.eth.abi.encodeFunctionCall(
              {name: 'proposalInvite', type: 'function', inputs: [{type: 'string', name: '_id'},{type: 'string', name: '_url'}, {type: 'address', name: '_nodeAddress'}]},
              ['SaaS_Provider1', 'test@sass.com', registeredNode1]
            );
            // Add the proposal
            let proposalId1 = await daoNodeTrustedPropose('hey guys, can we add this cool SaaS member please?', proposalCalldata1, {
                from: registeredNodeTrusted1
            });
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalId1)-timeCurrent)+2);
            // Now lets vote for the new members
            await daoNodeTrustedVote(proposalId1, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalId1, true, { from: registeredNodeTrusted2 });
            // Current time
            timeCurrent = await getCurrentTime(web3);
            // Fast forward to voting periods finishing
            await increaseTime(web3, (await getDAOProposalEndTime(proposalId1)-timeCurrent)+2);
            // Proposal should be successful, lets execute it
            await daoNodeTrustedExecute(proposalId1, { from: registeredNodeTrusted1 });
            // Member has now been invited to join, so lets do that
            // We'll allow the DAO to transfer our RPL bond before joining
            await rplMint(registeredNode1, rplBondAmount);
            await rplAllowanceDAO(registeredNode1, rplBondAmount);
            // Join now
            await daoNodeTrustedMemberJoin({from: registeredNode1});
            // Add a small wait
            await increaseTime(web3, 2);
            // Check the member is now valid
            assert(await getDAOMemberIsValid(registeredNode1), "registeredNode1 is not a membmer of the DAO");
            // Now we kick the member
            let proposalCalldata2 = web3.eth.abi.encodeFunctionCall(
              {name: 'proposalKick', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}, {type: 'uint256', name: '_rplFine'}]},
              [registeredNode1, 0]
            );
            // Add the proposal
            let proposalId2 = await daoNodeTrustedPropose('hey guys, this member hasn\'t logged on for weeks, lets boot them with a 33% fine!', proposalCalldata2, {
                from: registeredNodeTrusted1
            });
            // Current time
            timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalId2)-timeCurrent)+2);
            // Now lets vote
            await daoNodeTrustedVote(proposalId2, true, { from: registeredNodeTrusted1 });
            await daoNodeTrustedVote(proposalId2, true, { from: registeredNodeTrusted2 });
            await daoNodeTrustedVote(proposalId2, true, { from: registeredNodeTrusted3 });
            // Proposal has passed, lets execute it now
            await daoNodeTrustedExecute(proposalId2, { from: registeredNodeTrusted1 });
            // The new member has now been kicked
            assert(await getDAOMemberIsValid(registeredNode1) === false, "registeredNode1 is still a member of the DAO");
            // They should not be able to rejoin
            await rplAllowanceDAO(registeredNode1, rplBondAmount);
            await shouldRevert(daoNodeTrustedMemberJoin({from: registeredNode1}), "Member was able to join after being kicked", "This node has not been invited to join");
        });

        // ABIs - contract address field is ignored
        it(printTitle('guardian', 'can upgrade a contract ABI in bootstrap mode'), async () => {
            await setDaoNodeTrustedBootstrapUpgrade('upgradeABI', 'rocketNodeManager', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: guardian,
            });
        });

        it(printTitle('guardian', 'cannot upgrade a contract ABI to an identical one in bootstrap mode'), async () => {
            await setDaoNodeTrustedBootstrapUpgrade('upgradeABI', 'rocketNodeManager', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: guardian,
            });

            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('upgradeABI', 'rocketNodeManager', rocketMinipoolManagerNew.abi, '0x0000000000000000000000000000000000000000', {
                from: guardian,
            }), 'Upgraded a contract ABI to an identical one', 'ABIs are identical');
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

        it(printTitle('guardian', 'cannot add a new contract ABI with an empty ABI'), async () => {
            await shouldRevert(setDaoNodeTrustedBootstrapUpgrade('addABI', 'rocketNewFeatures', '', '0x0000000000000000000000000000000000000000', {
                from: guardian,
            }), 'Added a new contract ABI with an empty ABI', 'Empty ABI is invalid');
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
