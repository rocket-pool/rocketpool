import { RocketDAONodeTrusted, RocketDAONodeTrustedActions, RocketDAONodeTrustedSettings, RocketDAOProposal, RocketTokenRPL, RocketVault } from '../_utils/artifacts';
import { proposalStates, getDAOProposalState } from './scenario-dao-proposal';


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
            rocketDAOProposal.getState.call(_proposalID),
            rocketDAOProposal.getVotesFor.call(_proposalID),
            rocketDAOProposal.getVotesRequired.call(_proposalID),
        ]).then(
            ([proposalTotal, proposalState, proposalVotesFor, proposalVotesRequired]) =>
            ({proposalTotal, proposalState, proposalVotesFor, proposalVotesRequired})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAONodeTrusted.vote(_proposalID, _vote, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check proposals
    if(ds2.proposalState == proposalStates.Active) assert(ds2.proposalVotesFor.lt(ds2.proposalVotesRequired), 'Proposal state is active, votes for proposal should be less than the votes required');
    if(ds2.proposalState == proposalStates.Succeeded) assert(ds2.proposalVotesFor.gte(ds2.proposalVotesRequired), 'Proposal state is successful, yet does not have the votes required');

}


// Cancel a proposal for this DAO
export async function daoNodeTrustedCancel(_proposalID, txOptions) {

    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();

    // Add a new proposal
    await rocketDAONodeTrusted.cancel(_proposalID, txOptions);

    // Get the current state
    let state = Number(await getDAOProposalState(_proposalID));

    // Check proposals
    assert(state == proposalStates.Cancelled, 'Incorrect proposal state, should be cancelled');

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
            rocketDAONodeTrusted.getMemberCount.call(),
            rocketTokenRPL.balanceOf(txOptions.from),
            rocketVault.balanceOfToken('rocketDAONodeTrustedActions', rocketTokenRPL.address),
        ]).then(
            ([memberTotal, rplBalanceBond, rplBalanceVault]) =>
            ({memberTotal, rplBalanceBond, rplBalanceVault})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    //console.log('Member Total', Number(ds1.memberTotal), web3.utils.fromWei(ds1.rplBalanceBond), web3.utils.fromWei(ds1.rplBalanceVault));

    // Add a new proposal
    await rocketDAONodeTrustedActions.actionJoin(txOptions);

    // Capture data
    let ds2 = await getTxData();
    //console.log('Member Total', Number(ds2.memberTotal), web3.utils.fromWei(ds2.rplBalanceBond), web3.utils.fromWei(ds2.rplBalanceVault));

    // Check member count has increased
    assert(ds2.memberTotal.eq(ds1.memberTotal.add(web3.utils.toBN(1))), 'Member count has not increased');
    assert(ds2.rplBalanceVault.eq(ds1.rplBalanceVault.add(ds1.rplBalanceBond)), 'RocketVault address does not contain the correct RPL bond amount');

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
            rocketDAONodeTrusted.getMemberCount.call(),
            rocketTokenRPL.balanceOf(_rplRefundAddress),
            rocketVault.balanceOfToken('rocketDAONodeTrustedActions', rocketTokenRPL.address),
        ]).then(
            ([memberTotal, rplBalanceRefund, rplBalanceVault]) =>
            ({memberTotal, rplBalanceRefund, rplBalanceVault})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    // console.log('Member Total', Number(ds1.memberTotal), web3.utils.fromWei(ds1.rplBalanceRefund), web3.utils.fromWei(ds1.rplBalanceVault));

    // Add a new proposal
    await rocketDAONodeTrustedActions.actionLeave(_rplRefundAddress, txOptions);

    // Capture data
    let ds2 = await getTxData();
    // console.log('Member Total', Number(ds2.memberTotal), web3.utils.fromWei(ds2.rplBalanceRefund), web3.utils.fromWei(ds2.rplBalanceVault));

    // Verify
    assert(ds2.memberTotal.eq(ds1.memberTotal.sub(web3.utils.toBN(1))), 'Member count has not decreased');
    assert(ds2.rplBalanceVault.eq(ds1.rplBalanceVault.sub(ds2.rplBalanceRefund)), 'Member RPL refund address does not contain the correct RPL bond amount');

}


// A member wishes to replace themselves with a registered node
export async function daoNodeTrustedMemberReplace(newMemberAddress, txOptions) {

    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed();
    const rocketVault = await RocketVault.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getMemberIsValid.call(txOptions.from),
            rocketDAONodeTrusted.getMemberIsValid.call(newMemberAddress),
            rocketDAONodeTrusted.getMemberCount.call(),
            rocketVault.balanceOfToken('rocketDAONodeTrustedActions', rocketTokenRPL.address),
        ]).then(
            ([currentMemberStatus, newMemberStatus, memberTotal, rplBalanceVault]) =>
            ({currentMemberStatus, newMemberStatus, memberTotal, rplBalanceVault})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    //console.log(ds1.currentMemberStatus, ds1.newMemberStatus, 'Member Total', Number(ds1.memberTotal), web3.utils.fromWei(ds1.rplBalanceVault));

    // Add a new proposal
    await rocketDAONodeTrustedActions.actionReplace(txOptions);

    // Capture data
    let ds2 = await getTxData();
    //console.log(ds2.currentMemberStatus, ds2.newMemberStatus, 'Member Total', Number(ds2.memberTotal), web3.utils.fromWei(ds2.rplBalanceVault));

    // Check member count has increased
    assert(ds1.currentMemberStatus == true && ds2.currentMemberStatus == false, 'Current member is still a member');
    assert(ds1.newMemberStatus == false && ds2.newMemberStatus == true, 'New member has not replaced the current member');
    assert(ds2.memberTotal.eq(ds1.memberTotal), 'Member count has changed, should be the same');
    assert(ds2.rplBalanceVault.eq(ds1.rplBalanceVault), 'RPL Vault balance has changed');

}
