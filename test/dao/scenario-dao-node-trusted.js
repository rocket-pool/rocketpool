import { RocketDAONodeTrusted, RocketDAOProposal } from '../_utils/artifacts';
import { proposalStates, getDAOProposalState } from './scenario-dao-proposal';

// Returns the value of a DAO setting
export async function getDAOSettingUint(__settingPath, txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    return await rocketDAONodeTrusted.getSettingUint.call(__settingPath);
};

// Returns true if the address is a DAO member
export async function getDAOMemberIsValid(_nodeAddress, txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    return await rocketDAONodeTrusted.getMemberIsValid.call(_nodeAddress);
};

// Get the total members
export async function getDAONodeMemberCount(txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    return await rocketDAONodeTrusted.getMemberCount.call();
};

// Get the number of votes needed for a proposal to pass
export async function getDAONodeProposalQuorumVotesRequired(proposalID, txOptions) {
    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    return await rocketDAONodeTrusted.getProposalQuorumVotesRequired.call();
};

// Create a proposal for this DAO
export async function daoNodeTrustedPropose(_proposalMessage, _payload, txOptions) {

    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();

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
    await rocketDAONodeTrusted.propose(_proposalMessage, _payload, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // console.log(Number(ds1.proposalTotal), Number(ds2.proposalTotal));

    // Get the current state, new proposal should be in pending
    let state = Number(await getDAOProposalState(ds2.proposalTotal));

    // Check proposals
    assert(ds2.proposalTotal.eq(ds1.proposalTotal.add(web3.utils.toBN(1))), 'Incorrect proposal total count');
    assert(state == proposalStates.Pending, 'Incorrect proposal state, should be pending');
    
    // Return the proposal ID
    return Number(ds2.proposalTotal);

}


// Vote on a proposal for this DAO
export async function daoNodeTrustedVote(_proposalID, _vote, txOptions) {

    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();

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
    await rocketDAONodeTrusted.vote(_proposalID, _vote, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Get the current state
    let state = Number(await getDAOProposalState(_proposalID));

    // Check proposals
    assert(state == proposalStates.Active, 'Incorrect proposal state, should be active');

}


// Join the DAO after a successful invite proposal has passed
export async function daoNodeTrustedMemberJoin(txOptions) {

    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getMemberCount.call(),
        ]).then(
            ([memberTotal]) =>
            ({memberTotal})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    //console.log('Member Total', Number(ds1.memberTotal));

    // Add a new proposal
    await rocketDAONodeTrusted.memberJoin(txOptions);

    // Capture data
    let ds2 = await getTxData();
    //console.log('Member Total', Number(ds2.memberTotal));

    // Check member count has increased
    assert(ds2.memberTotal.eq(ds1.memberTotal.add(web3.utils.toBN(1))), 'Member count has not increased');

}


