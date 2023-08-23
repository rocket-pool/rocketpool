import {
    RocketDAOProposal,
    RocketNetworkVoting,
    RocketNodeManager,
    RocketDAOProtocolProposals,
    RocketDAOProtocolVerifier,
    RocketTokenRPL, RocketNodeStaking,
} from '../_utils/artifacts';
import { proposalStates, getDAOProposalState, getDAOProposalVotesRequired } from './scenario-dao-proposal';
import { assertBN } from '../_helpers/bn';
import { getRplBalance } from '../_helpers/tokens';

/**
 * Returns a 2d array of delegated voting power at a given block
 */
export async function getDelegatedVotingPower(block) {
    // Load contracts
    const rocketNetworkVoting = await RocketNetworkVoting.deployed();
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Grab the number of nodes at the block
    const nodeCount = (await rocketNetworkVoting.getNodeCount(block)).toNumber();

    // Setup data structs for calculation
    const delegatedPower = [];
    const delegateIndices = {};
    const addresses = [];
    const votingPower = [];

    // Loop over each node and collect their delegate and voting power
    for (let i = 0; i < nodeCount; i++) {
        const nodeAddress = await rocketNodeManager.getNodeAt(i);
        addresses[i] = nodeAddress;

        const power = await rocketNetworkVoting.getVotingPower(nodeAddress, block);
        const delegate = await rocketNetworkVoting.getDelegate(nodeAddress, block);

        delegatedPower.push({
            nodeAddress,
            power,
            delegate
        });

        delegateIndices[nodeAddress] = i;
    }

    // Loop over the nodes again and construct a 2-dim array of each node and which nodes have delegated to them
    for (let i = 0; i < nodeCount; i++) {
        const delegateAddress = addresses[i];

        votingPower.push([]);

        for (let j = 0; j < nodeCount; j++) {
            if (delegatedPower[j].delegate === delegateAddress) {
                votingPower[i].push(delegatedPower[j].power);
            } else {
                votingPower[i].push('0'.BN)
            }
        }
    }

    return votingPower;
}

export function constructLeaves(votingPower) {
    // Collect voting power
    const nodeCount = votingPower.length;

    if (nodeCount === 0) {
        return [];
    }

    const subDepth = Math.ceil(Math.log2(nodeCount));
    const subLeafCount = 2 ** subDepth;

    let tree = [];

    for (let i = 0; i < subLeafCount; i++) {
        if (i < nodeCount) {
            for (let j = 0; j < subLeafCount; j++) {
                let balance = "0".BN;
                if (j < nodeCount) {
                    balance = votingPower[i][j];
                }
                tree.push({
                    hash: web3.utils.soliditySha3({ v: balance, t: 'uint256' }),
                    sum: balance
                });
            }
        } else {
            // Fill rest of tree with 0's
            for (let j = 0; j < subLeafCount; j++) {
                let balance = "0".BN;
                tree.push({
                    hash: web3.utils.soliditySha3({ v: balance, t: 'uint256' }),
                    sum: balance
                });
            }
        }
    }

    return tree;
}

export async function daoProtocolGenerateCorrectPollard(block, order, index = 1) {
    const votingPower = await getDelegatedVotingPower(block);
    const leaves = await constructLeaves(votingPower);
    return daoProtocolGeneratePollard(leaves, order, index);
}

export function getDepthFromIndex(index) {
    return Math.floor(Math.log2(index));
}

// Construct a merkle tree pollard of a merkle sum tree of effective RPL stake to submit with a proposal
export async function daoProtocolGeneratePollard(leaves, order, index = 1) {
    // Create copy as we mutate it
    leaves = leaves.slice();
    let nodes = [];
    const offset = getDepthFromIndex(index);

    // Total depth of the tree
    const depth = Math.log2(leaves.length);

    if (order + offset > depth) {
        order -= (order + offset) - depth;
    }

    // Calculate pollard parameters
    const pollardSize = 2 ** order;
    const pollardDepth = offset + order;
    const pollardOffset = index * (2 ** order) - (2 ** (order + offset));

    // The
    if (depth === pollardDepth) {
        nodes = leaves.slice(pollardOffset, pollardOffset + pollardSize);
    }
    // Walk up the merkle tree until we get to the offset height
    for (let level = depth; level > offset; level--) {
        let n = 2 ** level;
        for (let i = 0; i < n / 2; i++) {
            const a = i * 2;
            const b = a + 1;
            leaves[i] = {
                hash: web3.utils.soliditySha3(
                    { t: 'bytes32', v: leaves[a].hash },
                    { t: 'uint256', v: leaves[a].sum },
                    { t: 'bytes32', v: leaves[b].hash },
                    { t: 'uint256', v: leaves[b].sum },
                ),
                sum: leaves[a].sum.add(leaves[b].sum)
            }
        }

        // Slice out the nodes for the pollard
        if (level-1 === offset + order) {
            nodes = leaves.slice(pollardOffset, pollardOffset + pollardSize);
        }
    }

    // Build a proof from the offset up to the root node
    const proof = [];
    for (let level = offset; level > 0; level--) {
        let n = 2 ** level;

        for (let i = 0; i < n / 2; i++) {
            const a = i * 2;
            const b = a + 1;

            const indexOffset = 2 ** level;

            if (indexOffset + a === index) {
                proof.push(leaves[b]);
            } else if (indexOffset + b === index) {
                proof.push(leaves[a]);
            }

            leaves[i] = {
                hash: web3.utils.soliditySha3(
                    { t: 'bytes32', v: leaves[a].hash },
                    { t: 'uint256', v: leaves[a].sum },
                    { t: 'bytes32', v: leaves[b].hash },
                    { t: 'uint256', v: leaves[b].sum },
                ),
                sum: leaves[a].sum.add(leaves[b].sum)
            }
        }

        index = Math.floor(index / 2);
    }

    return {
        proof,
        nodes
    };
}

// Create a proposal for this DAO
export async function daoProtocolPropose(_proposalMessage, _payload, _block, _treeNodes, txOptions) {
    // Create local copy
    const treeNodes = [];

    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOProtocolProposals = await RocketDAOProtocolProposals.deployed();

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

    // Convert BNs to strings and calculate quorum
    let quorum = '0'.BN;
    for (let i = 0; i < _treeNodes.length; i++) {
        quorum = quorum.add(_treeNodes[i].sum);

        treeNodes[i] = {
            sum: _treeNodes[i].sum.toString(),
            hash: _treeNodes[i].hash
        }
    }
    quorum = quorum.div('2'.BN);

    await rocketDAOProtocolProposals.propose(_proposalMessage, _payload, _block, treeNodes, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Get the current state, new proposal should be in pending
    let state = Number(await getDAOProposalState(ds2.proposalTotal));
    let votesRequired = await getDAOProposalVotesRequired(ds2.proposalTotal);

    // Check proposals
    assertBN.equal(ds2.proposalTotal, ds1.proposalTotal.add('1'.BN), 'Incorrect proposal total count');
    assert.strictEqual(state, proposalStates.Pending, 'Incorrect proposal state, should be pending');
    assertBN.equal(votesRequired, quorum, 'Incorrect votes required');

    // Return the proposal ID
    return Number(ds2.proposalTotal);
}


export async function daoProtocolCreateChallenge(_proposalID, _index, txOptions) {
    // Load contracts
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    // Create the challenge
    await rocketDAOProtocolVerifier.createChallenge(_proposalID, _index, txOptions);
}


export async function daoProtocolDefeatProposal(_proposalID, _index, txOptions) {
    // Load contracts
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    // Create the challenge
    await rocketDAOProtocolVerifier.defeatProposal(_proposalID, _index, txOptions);
}


export async function daoProtocolSubmitRoot(_proposalID, _challengeID, _witness, _treeNodes, txOptions) {
    // Create mutable copy
    _treeNodes = _treeNodes.slice();
    _witness = _witness.slice();
    // Load contracts
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    // Convert BN to strings
    for (let i = 0; i < _treeNodes.length; i++) {
        _treeNodes[i].sum = _treeNodes[i].sum.toString();
    }
    for (let i = 0; i < _witness.length; i++) {
        _witness[i].sum = _witness[i].sum.toString();
    }

    // Create the challenge
    await rocketDAOProtocolVerifier.submitRoot(_proposalID, _challengeID, _witness, _treeNodes, txOptions);
}

// Vote on a proposal for this DAO
export async function daoProtocolVote(_proposalID, _vote, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOProtocolProposals = await RocketDAOProtocolProposals.deployed();

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
    await rocketDAOProtocolProposals.vote(_proposalID, _vote, txOptions);

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


// Cancel a proposal for this DAO
export async function daoProtocolCancel(_proposalID, txOptions) {
    // Load contracts
    const rocketDAOProtocolProposals = await RocketDAOProtocolProposals.deployed();

    // Add a new proposal
    await rocketDAOProtocolProposals.cancel(_proposalID, txOptions);

    // Get the current state
    let state = Number(await getDAOProposalState(_proposalID));

    // Check proposals
    assert.strictEqual(state, proposalStates.Cancelled, 'Incorrect proposal state, should be cancelled');
}


// Execute a successful proposal
export async function daoProtocolExecute(_proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOProtocolProposals = await RocketDAOProtocolProposals.deployed();

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
    await rocketDAOProtocolProposals.execute(_proposalID, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check it was updated
    assertBN.equal(ds2.proposalState, proposalStates.Executed, 'Proposal is not in the executed state');
}

export async function daoProtocolClaimBondProposer(_proposalID, _indices, txOptions) {
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    const rocketNodeStaking = await RocketNodeStaking.deployed();

    const lockedBalanceBefore = await rocketNodeStaking.getNodeRPLLocked(txOptions.from);
    const balanceBefore = await rocketNodeStaking.getNodeRPLStake(txOptions.from);

    await rocketDAOProtocolVerifier.claimBondProposer(_proposalID, _indices, txOptions);

    const lockedBalanceAfter = await rocketNodeStaking.getNodeRPLLocked(txOptions.from);
    const balanceAfter = await rocketNodeStaking.getNodeRPLStake(txOptions.from);

    return {
        staked: balanceAfter.sub(balanceBefore),
        locked: lockedBalanceAfter.sub(lockedBalanceBefore),
    }
}

export async function daoProtocolClaimBondChallenger(_proposalID, _indices, txOptions) {
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    const rocketNodeStaking = await RocketNodeStaking.deployed();

    const lockedBalanceBefore = await rocketNodeStaking.getNodeRPLLocked(txOptions.from);
    const balanceBefore = await rocketNodeStaking.getNodeRPLStake(txOptions.from);

    await rocketDAOProtocolVerifier.claimBondChallenger(_proposalID, _indices, txOptions);

    const lockedBalanceAfter = await rocketNodeStaking.getNodeRPLLocked(txOptions.from);
    const balanceAfter = await rocketNodeStaking.getNodeRPLStake(txOptions.from);

    return {
        staked: balanceAfter.sub(balanceBefore),
        locked: lockedBalanceAfter.sub(lockedBalanceBefore),
    }
}
