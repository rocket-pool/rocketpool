import {
    RocketNetworkVoting,
    RocketDAOProtocolVerifier,
    RocketDAOProtocolSettingsProposals,
    RocketNodeStakingNew, RocketNodeManagerNew, RocketDAOProtocolProposal,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

// Possible states that a proposal may be in
export const proposalStates = {
    Pending      : 0,
    ActivePhase1 : 1,
    ActivePhase2 : 2,
    Cancelled    : 3,
    Vetoed       : 4,
    QuorumNotMet : 5,
    Defeated     : 6,
    Succeeded    : 7,
    Expired      : 8,
    Executed     : 9
};

// Get the status of a proposal
export async function getDAOProposalState(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProtocolProposal.deployed();
    return await rocketDAOProposal.getState.call(proposalID);
}

// Get the quorum for a proposal
export async function getDAOProposalVotesRequired(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProtocolProposal.deployed();
    return await rocketDAOProposal.getVotesRequired.call(proposalID);
}

/**
 * Returns an array of voting power for each node in the protocol at the given block
 */
export async function getDelegatedVotingPower(block) {
    // Load contracts
    const rocketNetworkVoting = await RocketNetworkVoting.deployed();
    const rocketNodeManager = await RocketNodeManagerNew.deployed();

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
        votingPower[i] = '0'.BN;
    }

    // Loop over the nodes again and compute final delegated voting power
    for (let i = 0; i < nodeCount; i++) {
        const delegateAddress = addresses[i];
        for (let j = 0; j < nodeCount; j++) {
            if (delegatedPower[j].delegate === delegateAddress) {
                votingPower[i] = votingPower[i].add(delegatedPower[j].power);
            }
        }
    }

    return votingPower;
}

export async function getPhase2VotingPower(block, nodeIndex) {
    // Load contracts
    const rocketNetworkVoting = await RocketNetworkVoting.deployed();
    const rocketNodeManager = await RocketNodeManagerNew.deployed();

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

    const nodeAddress = await rocketNodeManager.getNodeAt(nodeIndex);

    // Loop over the nodes again and sum voting power for given node index
    for (let i = 0; i < nodeCount; i++) {
        if (delegatedPower[i].delegate === nodeAddress) {
            votingPower.push(delegatedPower[i].power);
        } else {
            votingPower.push('0'.BN)
        }
    }

    return votingPower;
}

export function constructTreeLeaves(votingPower) {
    // Collect voting power
    const nodeCount = votingPower.length;

    if (nodeCount === 0) {
        return [];
    }

    const subDepth = Math.ceil(Math.log2(nodeCount));
    const leafCount = 2 ** subDepth;

    let tree = [];

    for (let j = 0; j < leafCount; j++) {
        let balance = "0".BN;
        if (j < nodeCount) {
            balance = votingPower[j];
        }
        tree.push({
            hash: web3.utils.soliditySha3({ v: balance, t: 'uint256' }),
            sum: balance
        });
    }

    return tree;
}

export function getDepthFromIndex(index) {
    return Math.floor(Math.log2(index));
}

export function cloneLeaves(leaves) {
    var ret = [];
    for (const leaf of leaves) {
        ret.push({
            hash: leaf.hash,
            sum: leaf.sum.toString().BN,
        });
    }
    return ret;
}

export function daoProtocolGenerateVoteProof(leaves, index) {
    // Create copy as we mutate it
    leaves = cloneLeaves(leaves);

    const sum = leaves[index].sum;

    const depth = Math.log2(leaves.length);
    index += 2 ** depth;
    const offset = getDepthFromIndex(index);

    // Build a proof from the challenged node up to the root node
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
        sum: sum,
        witness: proof,
    };
}

export function daoProtocolGenerateChallengeProof(leaves, order, index = 1) {
    // Create copy as we mutate it
    leaves = cloneLeaves(leaves);

    let node;

    let offset = getDepthFromIndex(index);

    // Total depth of the tree
    const depth = Math.log2(leaves.length);

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
    }

    // Save the challenged node
    const nodeOffset = index - (2 ** offset);

    node = leaves[nodeOffset];

    // Build a proof from the challenged node up to the root node
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

    let proofLength = order;

    // On last round, proof may be shorter
    if (offset === depth) {
        proofLength = depth % order;
    }
    if (proofLength === 0) {
        proofLength = order;
    }

    return {
        node: node,
        proof: proof.slice(0, proofLength),
    }
}

// Construct a merkle tree pollard of a merkle sum tree of effective RPL stake to submit with a proposal
export async function daoProtocolGeneratePollard(leaves, order, index = 1) {
    // Create copy as we mutate it
    leaves = cloneLeaves(leaves);
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

    return nodes;
}

export function getSubIndex(globalIndex, leaves) {
    // Total depth of the subtree
    const depth = Math.log2(leaves.length);
    // Total depth of the extended tree
    const maxDepth = depth * 2;
    // Global depth of the given index
    const globalDepth = getDepthFromIndex(globalIndex);
    // Depth of the given index into the subtree
    const phase2IndexDepth = globalDepth - depth;
    // Global root index of the subtree
    const phase2RootIndex = Math.floor(globalIndex / (2 ** phase2IndexDepth));
    // Subtree index of the given index
    const n = 2 ** phase2IndexDepth;
    return globalIndex - (phase2RootIndex * n) + n;
}

// Create a proposal for this DAO
export async function daoProtocolPropose(_proposalMessage, _payload, _block, _treeNodes, txOptions) {
    // Create local copy
    const treeNodes = [];

    // Load contracts
    // const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOProtocolProposal = await RocketDAOProtocolProposal.deployed();
    const rocketDAOProtocolSettingsProposal = await RocketDAOProtocolSettingsProposals.deployed();

    const proposalQuorum = await rocketDAOProtocolSettingsProposal.getProposalQuorum.call();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProtocolProposal.getTotal.call(),
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
    quorum = quorum.mul(proposalQuorum).div('1'.ether);

    await rocketDAOProtocolProposal.propose(_proposalMessage, _payload, _block, treeNodes, txOptions);

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


export async function daoProtocolCreateChallenge(_proposalID, _index, _node, _witness, txOptions) {
    _node.sum = _node.sum.toString();
    _witness = _witness.slice();
    for (let i = 0; i < _witness.length; i++) {
        _witness[i].sum = _witness[i].sum.toString();
    }
    // Load contracts
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    // Create the challenge
    await rocketDAOProtocolVerifier.createChallenge(_proposalID, _index, _node, _witness, txOptions);
}


export async function daoProtocolDefeatProposal(_proposalID, _index, txOptions) {
    // Load contracts
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    // Create the challenge
    await rocketDAOProtocolVerifier.defeatProposal(_proposalID, _index, txOptions);
}


export async function daoProtocolSubmitRoot(_proposalID, _index, _treeNodes, txOptions) {
    _treeNodes = cloneLeaves(_treeNodes);
    // Load contracts
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    // Convert BN to strings
    for (let i = 0; i < _treeNodes.length; i++) {
        _treeNodes[i].sum = _treeNodes[i].sum.toString();
    }

    // Create the challenge
    await rocketDAOProtocolVerifier.submitRoot(_proposalID, _index, _treeNodes, txOptions);
}

// Vote on a proposal for this DAO
export async function daoProtocolVote(_proposalID, _vote, _votingPower, _nodeIndex, _witness, txOptions) {
    // Load contracts
    const rocketDAOProtocolProposal = await RocketDAOProtocolProposal.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProtocolProposal.getTotal.call(),
            rocketDAOProtocolProposal.getState.call(_proposalID),
            rocketDAOProtocolProposal.getVotesFor.call(_proposalID),
            rocketDAOProtocolProposal.getVotesRequired.call(_proposalID),
        ]).then(
            ([proposalTotal, proposalState, proposalVotesFor, proposalVotesRequired]) =>
            ({proposalTotal, proposalState, proposalVotesFor, proposalVotesRequired})
        );
    }

    _witness = _witness.slice();
    for (let i = 0; i < _witness.length; i++) {
        _witness[i].sum = _witness[i].sum.toString();
    }

    // Add a new proposal
    await rocketDAOProtocolProposal.vote(_proposalID, _vote, _votingPower, _nodeIndex, _witness, txOptions);

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
    const rocketDAOProtocolProposal = await RocketDAOProtocolProposal.deployed();

    // Add a new proposal
    await rocketDAOProtocolProposal.cancel(_proposalID, txOptions);

    // Get the current state
    let state = Number(await getDAOProposalState(_proposalID));

    // Check proposals
    assert.strictEqual(state, proposalStates.Cancelled, 'Incorrect proposal state, should be cancelled');
}


// Execute a successful proposal
export async function daoProtocolExecute(_proposalID, txOptions) {
    // Load contracts
    const rocketDAOProtocolProposal = await RocketDAOProtocolProposal.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProtocolProposal.getState.call(_proposalID),
        ]).then(
            ([proposalState]) =>
            ({proposalState})
        );
    }

    // Execute a proposal
    await rocketDAOProtocolProposal.execute(_proposalID, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check it was updated
    assertBN.equal(ds2.proposalState, proposalStates.Executed, 'Proposal is not in the executed state');
}

export async function daoProtocolClaimBondProposer(_proposalID, _indices, txOptions) {
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    const rocketNodeStaking = await RocketNodeStakingNew.deployed();

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
    const rocketNodeStaking = await RocketNodeStakingNew.deployed();

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
