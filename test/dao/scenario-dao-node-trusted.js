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
    //console.log('Member Total', Number(ds1.memberTotal), web3.utils.fromWei(ds1.rplBalanceRefund), web3.utils.fromWei(ds1.rplBalanceVault));

    // Add a new proposal
    await rocketDAONodeTrustedActions.actionLeave(_rplRefundAddress, txOptions);

    // Capture data
    let ds2 = await getTxData();
    //console.log('Member Total', Number(ds2.memberTotal), web3.utils.fromWei(ds2.rplBalanceRefund), web3.utils.fromWei(ds2.rplBalanceVault));

    // Verify
    assert(ds2.memberTotal.eq(ds1.memberTotal.sub(web3.utils.toBN(1))), 'Member count has not decreased');
    assert(ds2.rplBalanceRefund.eq(ds1.rplBalanceVault.sub(ds2.rplBalanceRefund)), 'Member RPL refund address does not contain the correct RPL bond amount');

}


