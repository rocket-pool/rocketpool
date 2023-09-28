import {
    RocketDAONodeTrusted,
    RocketDAONodeTrustedProposals,
    RocketDAONodeTrustedActions,
    RocketDAOProposal,
    RocketTokenRPL,
    RocketVault, RocketDAOSecurity, RocketDAOSecurityProposals, RocketDAOSecurityActions,
} from '../_utils/artifacts';
import { proposalStates, getDAOProposalState } from './scenario-dao-proposal';
import { assertBN } from '../_helpers/bn';


// Returns true if the address is a DAO member
export async function getDAOSecurityMemberIsValid(_nodeAddress) {
    // Load contracts
    const rocketDAOSecurity = await RocketDAOSecurity.deployed();
    return await rocketDAOSecurity.getMemberIsValid.call(_nodeAddress);
}

// Get the total members
export async function getDAOSecurityMemberCount() {
    // Load contracts
    const rocketDAOSecurity = await RocketDAOSecurity.deployed();
    return await rocketDAOSecurity.getMemberCount.call();
}

// Get the number of votes needed for a proposal to pass
export async function getDAOSecurityProposalQuorumVotesRequired(proposalID) {
    // Load contracts
    const rocketDAOSecurity = await RocketDAOSecurity.deployed();
    return await rocketDAOSecurity.getProposalQuorumVotesRequired.call();
}

// Create a proposal for this DAO
export async function daoSecurityPropose(_proposalMessage, _payload, txOptions) {

    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOSecurityProposals = await RocketDAOSecurityProposals.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProposal.getTotal.call(),
        ]).then(
            ([proposalTotal]) =>
            ({proposalTotal})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAOSecurityProposals.propose(_proposalMessage, _payload, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Get the current state, new proposal should be in pending
    let state = Number(await getDAOProposalState(ds2.proposalTotal));

    // Check proposals
    assertBN.equal(ds2.proposalTotal, ds1.proposalTotal.add('1'.BN), 'Incorrect proposal total count');
    assert.strictEqual(state, proposalStates.Pending, 'Incorrect proposal state, should be pending');
    
    // Return the proposal ID
    return Number(ds2.proposalTotal);
}


// Vote on a proposal for this DAO
export async function daoSecurityVote(_proposalID, _vote, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOSecurityProposals = await RocketDAOSecurityProposals.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProposal.getTotal.call(),
            rocketDAOProposal.getState.call(_proposalID),
            rocketDAOProposal.getVotesFor.call(_proposalID),
            rocketDAOProposal.getVotesRequired.call(_proposalID),
        ]).then(
            ([proposalTotal, proposalState, proposalVotesFor, proposalVotesRequired]) =>
            ({proposalTotal, proposalState, proposalVotesFor, proposalVotesRequired})
        );
    }

    // Add a new proposal
    await rocketDAOSecurityProposals.vote(_proposalID, _vote, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check proposals
    if(ds2.proposalState === proposalStates.Active) {
        assertBN.isBelow(ds2.proposalVotesFor, ds2.proposalVotesRequired, 'Proposal state is active, votes for proposal should be less than the votes required');
    }
    if(ds2.proposalState === proposalStates.Succeeded) {
        assertBN.isAtLeast(ds2.proposalVotesFor, ds2.proposalVotesRequired, 'Proposal state is successful, yet does not have the votes required');
    }
}


// Execute a successful proposal
export async function daoSecurityExecute(_proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOSecurityProposals = await RocketDAOSecurityProposals.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProposal.getState.call(_proposalID),
        ]).then(
            ([proposalState]) =>
            ({proposalState})
        );
    }

    // Execute a proposal
    await rocketDAOSecurityProposals.execute(_proposalID, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check it was updated
    assertBN.equal(ds2.proposalState, proposalStates.Executed, 'Proposal is not in the executed state');
}


// Join the DAO after a successful invite proposal has passed
export async function daoSecurityMemberJoin(txOptions) {
    // Load contracts
    const rocketDAOSecurity = await RocketDAOSecurity.deployed();
    const rocketDAOSecurityActions = await RocketDAOSecurityActions.deployed()

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOSecurity.getMemberCount.call(),
        ]).then(
            ([memberTotal]) =>
            ({memberTotal})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAOSecurityActions.actionJoin(txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check member count has increased
    assertBN.equal(ds2.memberTotal, ds1.memberTotal.add('1'.BN), 'Member count has not increased');
}


// Leave the DAO after a successful leave proposal has passed
export async function daoSecurityMemberLeave(txOptions) {
    // Load contracts
    const rocketDAOSecurity = await RocketDAOSecurity.deployed();
    const rocketDAOSecurityActions = await RocketDAOSecurityActions.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOSecurity.getMemberCount.call(),
        ]).then(
            ([memberTotal]) =>
            ({memberTotal})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAOSecurityActions.actionLeave(txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Verify
    assertBN.equal(ds2.memberTotal, ds1.memberTotal.sub('1'.BN), 'Member count has not decreased');
}


// Request leaving the security council
export async function daoSecurityMemberRequestLeave(txOptions) {
    // Load contracts
    const rocketDAOSecurityActions = await RocketDAOSecurityActions.deployed();
    // Submit request
    await rocketDAOSecurityActions.actionRequestLeave(txOptions);
}


