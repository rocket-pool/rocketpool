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
};

// Get the block a proposal can start being voted on
export async function getDAOProposalStartBlock(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    return await rocketDAOProposal.getStart.call(proposalID);
};

// Get the block a proposal can end being voted on
export async function getDAOProposalEndBlock(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    return await rocketDAOProposal.getEnd.call(proposalID);
};

// Get the vote count for a proposal
export async function getDAOProposalVotesFor(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    return await rocketDAOProposal.getVotesFor.call(proposalID);
};

// Get the vote count against a proposal
export async function getDAOProposalVotesAgainst(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    return await rocketDAOProposal.getVotesAgainst.call(proposalID);
};


// Execute a successful proposal
export async function DAOProposalExecute(_proposalID, txOptions) {

    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProposal.getState.call(_proposalID),
        ]).then(
            ([proposalState]) =>
            ({proposalState})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    //console.log(Number(ds1.proposalState));

    // Execute a proposal
    await rocketDAOProposal.execute(_proposalID, txOptions);

    // Capture data
    let ds2 = await getTxData();
    //console.log(Number(ds2.proposalState));

    // Check it was updated
    assert(ds2.proposalState.eq(web3.utils.toBN(6)), 'Proposal is not in the executed state');

}




