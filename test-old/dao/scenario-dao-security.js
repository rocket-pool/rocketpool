import {
    RocketDAOProposal,
    RocketDAOSecurity,
    RocketDAOSecurityActions,
    RocketDAOSecurityProposals, RocketDAOSecurityUpgrade,
} from '../_utils/artifacts';
import { getDAOProposalState, proposalStates } from './scenario-dao-proposal';
import { assertBN } from '../_helpers/bn';
import * as assert from 'assert';

// Returns true if the address is a DAO member
export async function getDAOSecurityMemberIsValid(_nodeAddress) {
    // Load contracts
    const rocketDAOSecurity = await RocketDAOSecurity.deployed();
    return await rocketDAOSecurity.getMemberIsValid(_nodeAddress);
}

// Get the total members
export async function getDAOSecurityMemberCount() {
    // Load contracts
    const rocketDAOSecurity = await RocketDAOSecurity.deployed();
    return await rocketDAOSecurity.getMemberCount();
}

// Get the number of votes needed for a proposal to pass
export async function getDAOSecurityProposalQuorumVotesRequired(proposalID) {
    // Load contracts
    const rocketDAOSecurity = await RocketDAOSecurity.deployed();
    return await rocketDAOSecurity.getProposalQuorumVotesRequired();
}

// Create a proposal for this DAO
export async function daoSecurityPropose(_proposalMessage, _payload, txOptions) {

    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOSecurityProposals = await RocketDAOSecurityProposals.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProposal.getTotal(),
        ]).then(
            ([proposalTotal]) =>
                ({ proposalTotal }),
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAOSecurityProposals.connect(txOptions.from).propose(_proposalMessage, _payload, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Get the current state, new proposal should be in pending
    let state = Number(await getDAOProposalState(ds2.proposalTotal));

    // Check proposals
    assertBN.equal(ds2.proposalTotal, ds1.proposalTotal + 1n, 'Incorrect proposal total count');
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
            rocketDAOProposal.getTotal(),
            rocketDAOProposal.getState(_proposalID),
            rocketDAOProposal.getVotesFor(_proposalID),
            rocketDAOProposal.getVotesRequired(_proposalID),
        ]).then(
            ([proposalTotal, proposalState, proposalVotesFor, proposalVotesRequired]) =>
                ({ proposalTotal, proposalState, proposalVotesFor, proposalVotesRequired }),
        );
    }

    // Add a new proposal
    await rocketDAOSecurityProposals.connect(txOptions.from).vote(_proposalID, _vote, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check proposals
    if (ds2.proposalState === proposalStates.Active) {
        assertBN.isBelow(ds2.proposalVotesFor, ds2.proposalVotesRequired, 'Proposal state is active, votes for proposal should be less than the votes required');
    }
    if (ds2.proposalState === proposalStates.Succeeded) {
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
            rocketDAOProposal.getState(_proposalID),
        ]).then(
            ([proposalState]) =>
                ({ proposalState }),
        );
    }

    // Execute a proposal
    await rocketDAOSecurityProposals.connect(txOptions.from).execute(_proposalID, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check it was updated
    assertBN.equal(ds2.proposalState, proposalStates.Executed, 'Proposal is not in the executed state');
}

// Join the DAO after a successful invite proposal has passed
export async function daoSecurityMemberJoin(txOptions) {
    // Load contracts
    const rocketDAOSecurity = await RocketDAOSecurity.deployed();
    const rocketDAOSecurityActions = (await RocketDAOSecurityActions.deployed()).connect(txOptions.from);

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOSecurity.getMemberCount(),
        ]).then(
            ([memberTotal]) =>
                ({ memberTotal }),
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAOSecurityActions.actionJoin(txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check member count has increased
    assertBN.equal(ds2.memberTotal, ds1.memberTotal + 1n, 'Member count has not increased');
}

// Leave the DAO after a successful leave proposal has passed
export async function daoSecurityMemberLeave(txOptions) {
    // Load contracts
    const rocketDAOSecurity = await RocketDAOSecurity.deployed();
    const rocketDAOSecurityActions = await RocketDAOSecurityActions.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOSecurity.getMemberCount(),
        ]).then(
            ([memberTotal]) =>
                ({ memberTotal }),
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAOSecurityActions.connect(txOptions.from).actionLeave(txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Verify
    assertBN.equal(ds2.memberTotal, ds1.memberTotal - 1n, 'Member count has not decreased');
}

// Request leaving the security council
export async function daoSecurityMemberRequestLeave(txOptions) {
    const rocketDAOSecurityActions = await RocketDAOSecurityActions.deployed();
    await rocketDAOSecurityActions.connect(txOptions.from).actionRequestLeave(txOptions);
}


