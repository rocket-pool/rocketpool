import {
    RocketDAONodeTrusted,
    RocketDAONodeTrustedActions,
    RocketDAONodeTrustedProposals,
    RocketDAOProposal,
    RocketTokenRPL,
    RocketVault,
} from '../_utils/artifacts';
import { getDAOProposalState, proposalStates } from './scenario-dao-proposal';
import { assertBN } from '../_helpers/bn';
import * as assert from 'assert';

// Returns true if the address is a DAO member
export async function getDAOMemberIsValid(_nodeAddress, txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    return await rocketDAONodeTrusted.getMemberIsValid(_nodeAddress);
}

// Get the total members
export async function getDAONodeMemberCount(txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    return await rocketDAONodeTrusted.getMemberCount();
}

// Get the number of votes needed for a proposal to pass
export async function getDAONodeProposalQuorumVotesRequired(proposalID, txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    return await rocketDAONodeTrusted.getProposalQuorumVotesRequired();
}

// Create a proposal for this DAO
export async function daoNodeTrustedPropose(_proposalMessage, _payload, txOptions) {

    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAONodeTrustedProposals = await RocketDAONodeTrustedProposals.deployed();

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
    await rocketDAONodeTrustedProposals.connect(txOptions.from).propose(_proposalMessage, _payload, txOptions);

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
export async function daoNodeTrustedVote(_proposalID, _vote, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAONodeTrustedProposals = await RocketDAONodeTrustedProposals.deployed();

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
    await rocketDAONodeTrustedProposals.connect(txOptions.from).vote(_proposalID, _vote, txOptions);

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

// Cancel a proposal for this DAO
export async function daoNodeTrustedCancel(_proposalID, txOptions) {
    // Load contracts
    const rocketDAONodeTrustedProposals = await RocketDAONodeTrustedProposals.deployed();

    // Add a new proposal
    await rocketDAONodeTrustedProposals.connect(txOptions.from).cancel(_proposalID, txOptions);

    // Get the current state
    let state = Number(await getDAOProposalState(_proposalID));

    // Check proposals
    assert.strictEqual(state, proposalStates.Cancelled, 'Incorrect proposal state, should be cancelled');
}

// Execute a successful proposal
export async function daoNodeTrustedExecute(_proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAONodeTrustedProposals = await RocketDAONodeTrustedProposals.deployed();

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
    await rocketDAONodeTrustedProposals.connect(txOptions.from).execute(_proposalID, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check it was updated
    assertBN.equal(ds2.proposalState, proposalStates.Executed, 'Proposal is not in the executed state');
}

// Join the DAO after a successful invite proposal has passed
export async function daoNodeTrustedMemberJoin(txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed();
    const rocketVault = await RocketVault.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getMemberCount(),
            rocketTokenRPL.balanceOf(txOptions.from),
            rocketVault.balanceOfToken('rocketDAONodeTrustedActions', rocketTokenRPL.target),
        ]).then(
            ([memberTotal, rplBalanceBond, rplBalanceVault]) =>
                ({ memberTotal, rplBalanceBond, rplBalanceVault }),
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAONodeTrustedActions.connect(txOptions.from).actionJoin(txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check member count has increased
    assertBN.equal(ds2.memberTotal, ds1.memberTotal + 1n, 'Member count has not increased');
    assertBN.equal(ds2.rplBalanceVault, ds1.rplBalanceVault + ds1.rplBalanceBond, 'RocketVault address does not contain the correct RPL bond amount');
}

// Leave the DAO after a successful leave proposal has passed
export async function daoNodeTrustedMemberLeave(_rplRefundAddress, txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed();
    const rocketVault = await RocketVault.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getMemberCount(),
            rocketTokenRPL.balanceOf(_rplRefundAddress),
            rocketVault.balanceOfToken('rocketDAONodeTrustedActions', rocketTokenRPL.target),
        ]).then(
            ([memberTotal, rplBalanceRefund, rplBalanceVault]) =>
                ({ memberTotal, rplBalanceRefund, rplBalanceVault }),
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAONodeTrustedActions.connect(txOptions.from).actionLeave(_rplRefundAddress, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Verify
    assertBN.equal(ds2.memberTotal, ds1.memberTotal - 1n, 'Member count has not decreased');
    assertBN.equal(ds2.rplBalanceVault, ds1.rplBalanceVault - ds2.rplBalanceRefund, 'Member RPL refund address does not contain the correct RPL bond amount');
}

// Challenger a members node to respond and signal it is still alive
export async function daoNodeTrustedMemberChallengeMake(_nodeAddress, txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getMemberIsValid(_nodeAddress),
            rocketDAONodeTrusted.getMemberIsChallenged(_nodeAddress),
        ]).then(
            ([currentMemberStatus, memberChallengedStatus]) =>
                ({ currentMemberStatus, memberChallengedStatus }),
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAONodeTrustedActions.connect(txOptions.from).actionChallengeMake(_nodeAddress, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check member count has increased
    assert.strictEqual(ds1.currentMemberStatus, true, 'Challenged member has had their membership removed');
    assert.strictEqual(ds1.memberChallengedStatus, false, 'Challenged a member that was already challenged');
    assert.strictEqual(ds2.memberChallengedStatus, true, 'Member did not become challenged');
}

// Decide a challenges outcome
export async function daoNodeTrustedMemberChallengeDecide(_nodeAddress, _expectedMemberStatus, txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getMemberIsValid(_nodeAddress),
            rocketDAONodeTrusted.getMemberIsChallenged(_nodeAddress),
        ]).then(
            ([currentMemberStatus, memberChallengedStatus]) =>
                ({ currentMemberStatus, memberChallengedStatus }),
        );
    }

    // Add a new proposal
    await rocketDAONodeTrustedActions.connect(txOptions.from).actionChallengeDecide(_nodeAddress, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check member count has increased
    assert.strictEqual(ds2.currentMemberStatus, _expectedMemberStatus, 'Challenged member did not become their expected status');
}
