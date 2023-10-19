import {
    RocketDAOProposal,
    RocketNetworkVoting,
    RocketNodeManager,
    RocketDAOProtocolProposals,
    RocketDAOProtocolVerifier,
    RocketTokenRPL,
    RocketNodeStaking,
    RocketDAOProtocolSettingsProposals,
    RocketDAOProtocolProposalsNew,
    RocketNodeStakingNew, RocketNodeManagerNew,
} from '../_utils/artifacts';
import { proposalStates, getDAOProposalState, getDAOProposalVotesRequired } from './scenario-dao-proposal';
import { assertBN } from '../_helpers/bn';
import { getRplBalance } from '../_helpers/tokens';

/**
 * Returns an array of voting power for each node in the protocot given block
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

export function constructPhase1Leaves(votingPower) {
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

export function constructPhase2Leaves(votingPower) {
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

export function getDepthFromIndex(index) {
    return Math.floor(Math.log2(index));
}

function cloneLeaves(leaves) {
    var ret = [];
    for (const leaf of leaves) {
        ret.push({
            hash: leaf.hash,
            sum: leaf.sum.toString().BN,
        });
    }
    return ret;
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

// Construct a merkle tree pollard of a merkle sum tree of effective RPL stake to submit with a proposal
export async function daoProtocolGeneratePhase2Pollard(phase2Leaves, phase1Leaves, order, globalIndex = 1) {
    // Total depth of the subtree
    const depth = Math.log2(phase2Leaves.length);
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
    let index = globalIndex - (phase2RootIndex * n) + n;

    console.log('Phase 1 depth ' + depth);
    console.log('Max depth ' + maxDepth);
    console.log('Global depth ' + globalDepth);
    console.log('Phase 2 root index ' + phase2RootIndex);
    console.log('Phase 2 index ' + index);
    console.log('Phase 2 depth ' + depth);

    // Create copy as we mutate it
    phase2Leaves = cloneLeaves(phase2Leaves);
    phase1Leaves = cloneLeaves(phase1Leaves);
    let nodes = [];
    const offset = getDepthFromIndex(index);

    if (order + offset > depth) {
        order -= (order + offset) - depth;
    }

    // Calculate pollard parameters
    const pollardSize = 2 ** order;
    const pollardDepth = offset + order;
    const pollardOffset = index * (2 ** order) - (2 ** (order + offset));

    // The
    if (depth === pollardDepth) {
        nodes = phase2Leaves.slice(pollardOffset, pollardOffset + pollardSize);
    }
    // Walk up the merkle tree until we get to the offset height
    for (let level = depth; level > offset; level--) {
        let n = 2 ** level;
        for (let i = 0; i < n / 2; i++) {
            const a = i * 2;
            const b = a + 1;
            phase2Leaves[i] = {
                hash: web3.utils.soliditySha3(
                    { t: 'bytes32', v: phase2Leaves[a].hash },
                    { t: 'uint256', v: phase2Leaves[a].sum },
                    { t: 'bytes32', v: phase2Leaves[b].hash },
                    { t: 'uint256', v: phase2Leaves[b].sum },
                ),
                sum: phase2Leaves[a].sum.add(phase2Leaves[b].sum)
            }
        }

        // Slice out the nodes for the pollard
        if (level-1 === offset + order) {
            nodes = phase2Leaves.slice(pollardOffset, pollardOffset + pollardSize);
        }
    }

    // Build a proof from the offset up to the subtree root node
    const proof = [];
    for (let level = offset; level > 0; level--) {
        let n = 2 ** level;

        for (let i = 0; i < n / 2; i++) {
            const a = i * 2;
            const b = a + 1;

            const indexOffset = 2 ** level;

            if (indexOffset + a === index) {
                proof.push(phase2Leaves[b]);
            } else if (indexOffset + b === index) {
                proof.push(phase2Leaves[a]);
            }

            phase2Leaves[i] = {
                hash: web3.utils.soliditySha3(
                    { t: 'bytes32', v: phase2Leaves[a].hash },
                    { t: 'uint256', v: phase2Leaves[a].sum },
                    { t: 'bytes32', v: phase2Leaves[b].hash },
                    { t: 'uint256', v: phase2Leaves[b].sum },
                ),
                sum: phase2Leaves[a].sum.add(phase2Leaves[b].sum)
            }
        }

        index = Math.floor(index / 2);
    }

    // Extend the proof from the subtree root node to the extended tree root node
    console.log(phase1Leaves);
    if (globalDepth == depth) {

        index = phase2RootIndex;
        for (let level = depth; level > 0; level--) {
            let n = 2 ** level;

            for (let i = 0; i < n / 2; i++) {
                const a = i * 2;
                const b = a + 1;

                const indexOffset = 2 ** level;

                if (indexOffset + a === index) {
                    proof.push(phase1Leaves[b]);
                } else if (indexOffset + b === index) {
                    proof.push(phase1Leaves[a]);
                }

                phase1Leaves[i] = {
                    hash: web3.utils.soliditySha3(
                        { t: 'bytes32', v: phase1Leaves[a].hash },
                        { t: 'uint256', v: phase1Leaves[a].sum },
                        { t: 'bytes32', v: phase1Leaves[b].hash },
                        { t: 'uint256', v: phase1Leaves[b].sum },
                    ),
                    sum: phase1Leaves[a].sum.add(phase1Leaves[b].sum)
                }
            }

            index = Math.floor(index / 2);
        }
    }

    console.log('Nodes:');
    printNodes(nodes);
    console.log('Proof:');
    printNodes(proof);

    return {
        proof,
        nodes
    };
}

// Create a proposal for this DAO
export async function daoProtocolPropose(_proposalMessage, _payload, _block, _treeNodes, txOptions) {
    console.log('Proposing');
    console.log('Nodes:');
    printNodes(_treeNodes);
    // Create local copy
    const treeNodes = [];

    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOProtocolProposals = await RocketDAOProtocolProposalsNew.deployed();
    const rocketDAOProtocolSettingsProposal = await RocketDAOProtocolSettingsProposals.deployed();

    const proposalQuorum = await rocketDAOProtocolSettingsProposal.getProposalQuorum.call();

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
    quorum = quorum.mul(proposalQuorum).div('1'.ether);

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
    console.log('Creating challenge for index ' + _index);
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


function printNodes(nodes) {
    for(const node of nodes) {
        console.log(node.hash);
        console.log(node.sum.div('1'.ether).toString());
        console.log('--');
    }
}

export async function daoProtocolSubmitRoot(_proposalID, _index, _witness, _treeNodes, txOptions) {
    console.log('Responding to challenge for index ' + _index);
    console.log('Nodes:');
    printNodes(_treeNodes);
    console.log('Witness:');
    printNodes(_witness);
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
    await rocketDAOProtocolVerifier.submitRoot(_proposalID, _index, _witness, _treeNodes, txOptions);
}

// Vote on a proposal for this DAO
export async function daoProtocolVote(_proposalID, _vote, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAOProtocolProposals = await RocketDAOProtocolProposalsNew.deployed();

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
    const rocketDAOProtocolProposals = await RocketDAOProtocolProposalsNew.deployed();

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
    const rocketDAOProtocolProposals = await RocketDAOProtocolProposalsNew.deployed();

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
