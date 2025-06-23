import {
    RocketDAOProposal,
    RocketDAOSecurity,
    RocketDAOSecurityActions,
    RocketDAOSecurityProposals, RocketDAOSecurityUpgrade,
} from '../_utils/artifacts';
import { getDAOProposalState, proposalStates } from './scenario-dao-proposal';
import { assertBN } from '../_helpers/bn';
import * as assert from 'assert';

// Create a veto proposal for this DAO
export async function daoSecurityProposeVeto(_proposalMessage, _proposalId, txOptions) {

    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOSecurityUpgrade = await RocketDAOSecurityUpgrade.deployed();

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
    await rocketDAOSecurityUpgrade.connect(txOptions.from).proposeVeto(_proposalMessage, _proposalId, txOptions);

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
export async function daoSecurityUpgradeVote(_proposalID, _vote, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOSecurityUpgrade = await RocketDAOSecurityUpgrade.deployed();

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
    await rocketDAOSecurityUpgrade.connect(txOptions.from).vote(_proposalID, _vote, txOptions);

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
export async function daoSecurityUpgradeExecute(_proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOSecurityUpgrade = await RocketDAOSecurityUpgrade.deployed();

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
    await rocketDAOSecurityUpgrade.connect(txOptions.from).execute(_proposalID, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check it was updated
    assertBN.equal(ds2.proposalState, proposalStates.Executed, 'Proposal is not in the executed state');
}

