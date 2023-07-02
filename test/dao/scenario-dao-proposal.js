import { RocketDAOProposal } from '../_utils/artifacts';


// Possible states that a proposal may be in
export const proposalStates = {
    Pending     : 0,
    Active      : 1,
    Cancelled   : 2,
    Defeated    : 3,
    Succeeded   : 4,
    Expired     : 5,
    Executed    : 6
};

// Get the status of a proposal
export async function getDAOProposalState(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    return await rocketDAOProposal.getState.call(proposalID);
}

// Get the block a proposal can start being voted on
export async function getDAOProposalStartTime(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    return await rocketDAOProposal.getStart.call(proposalID);
}

// Get the block a proposal can end being voted on
export async function getDAOProposalEndTime(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    return await rocketDAOProposal.getEnd.call(proposalID);
}

// Get the block a proposal expires
export async function getDAOProposalExpires(proposalID, txOptions) {
  // Load contracts
  const rocketDAOProposal = await RocketDAOProposal.deployed();
  return await rocketDAOProposal.getExpires.call(proposalID);
}

// Get the vote count for a proposal
export async function getDAOProposalVotesFor(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    return await rocketDAOProposal.getVotesFor.call(proposalID);
}

// Get the vote count against a proposal
export async function getDAOProposalVotesAgainst(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    return await rocketDAOProposal.getVotesAgainst.call(proposalID);
}

// Get the quroum for a proposal
export async function getDAOProposalVotesRequired(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    return await rocketDAOProposal.getVotesRequired.call(proposalID);
}
