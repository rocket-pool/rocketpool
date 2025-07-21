import {
    RocketDAOProtocolProposal, RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsProposals,
    RocketDAOProtocolVerifier,
    RocketNetworkVoting,
    RocketNodeManager,
    RocketNodeStaking,
    RocketTokenRPL,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import { voteStates } from './scenario-dao-proposal';
import { shouldRevert } from '../_utils/testing';
import { getDaoProtocolProposalBond } from '../_helpers/dao';
import * as assert from 'assert';

const hre = require('hardhat');
const ethers = hre.ethers;

// Possible states that a proposal may be in
export const proposalStates = {
    Pending: 0,
    ActivePhase1: 1,
    ActivePhase2: 2,
    Cancelled: 3,
    Vetoed: 4,
    QuorumNotMet: 5,
    Defeated: 6,
    Succeeded: 7,
    Expired: 8,
    Executed: 9,
};

// Get the status of a proposal
export async function getDAOProposalState(proposalID) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProtocolProposal.deployed();
    return await rocketDAOProposal.getState(proposalID);
}

// Get the quorum for a proposal
export async function getDAOProposalVotesRequired(proposalID, txOptions) {
    // Load contracts
    const rocketDAOProposal = await RocketDAOProtocolProposal.deployed();
    return await rocketDAOProposal.getVotingPowerRequired(proposalID);
}

/**
 * Returns an array of voting power for each node in the protocol at the given block
 */
export async function getDelegatedVotingPower(block) {
    // Load contracts
    const rocketNetworkVoting = await RocketNetworkVoting.deployed();
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Grab the number of nodes at the block
    const nodeCount = await rocketNetworkVoting.getNodeCount(block);

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
            delegate,
        });

        delegateIndices[nodeAddress] = i;
        votingPower[i] = 0n;
    }

    // Loop over the nodes again and compute final delegated voting power
    for (let i = 0; i < nodeCount; i++) {
        const delegateAddress = addresses[i];
        for (let j = 0; j < nodeCount; j++) {
            if (delegatedPower[j].delegate === delegateAddress) {
                votingPower[i] = votingPower[i] + delegatedPower[j].power;
            }
        }
    }

    return votingPower;
}

export async function getPhase2VotingPower(block, nodeIndex) {
    // Load contracts
    const rocketNetworkVoting = await RocketNetworkVoting.deployed();
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Grab the number of nodes at the block
    const nodeCount = Number(await rocketNetworkVoting.getNodeCount(block));

    // Setup data structs for calculation
    const delegatedPower = [];
    const delegateIndices = {};
    const votingPower = [];

    // Loop over each node and collect their delegate and voting power
    for (let i = 0; i < nodeCount; i++) {
        const nodeAddress = await rocketNodeManager.getNodeAt(i);
        const power = await rocketNetworkVoting.getVotingPower(nodeAddress, block);
        const delegate = await rocketNetworkVoting.getDelegate(nodeAddress, block);

        delegatedPower.push({
            nodeAddress,
            power,
            delegate,
        });

        delegateIndices[nodeAddress] = i;
    }

    const nodeAddress = await rocketNodeManager.getNodeAt(nodeIndex);

    // Loop over the nodes again and sum voting power for given node index
    for (let i = 0; i < nodeCount; i++) {
        if (delegatedPower[i].delegate === nodeAddress) {
            votingPower.push(delegatedPower[i].power);
        } else {
            votingPower.push(0n);
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
        let balance = 0n;
        if (j < nodeCount) {
            balance = votingPower[j];
        }
        tree.push({
            hash: ethers.solidityPackedKeccak256(['uint256'], [balance]),
            sum: balance,
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
                hash: ethers.solidityPackedKeccak256(
                    ['bytes32', 'uint256', 'bytes32', 'uint256'],
                    [leaves[a].hash, leaves[a].sum, leaves[b].hash, leaves[b].sum],
                ),
                sum: leaves[a].sum + leaves[b].sum,
            };
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
                hash: ethers.solidityPackedKeccak256(
                    ['bytes32', 'uint256', 'bytes32', 'uint256'],
                    [leaves[a].hash, leaves[a].sum, leaves[b].hash, leaves[b].sum],
                ),
                sum: leaves[a].sum + leaves[b].sum,
            };
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
                hash: ethers.solidityPackedKeccak256(
                    ['bytes32', 'uint256', 'bytes32', 'uint256'],
                    [leaves[a].hash, leaves[a].sum, leaves[b].hash, leaves[b].sum],
                ),
                sum: leaves[a].sum + leaves[b].sum,
            };
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
    };
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
                hash: ethers.solidityPackedKeccak256(
                    ['bytes32', 'uint256', 'bytes32', 'uint256'],
                    [leaves[a].hash, leaves[a].sum, leaves[b].hash, leaves[b].sum],
                ),
                sum: leaves[a].sum + leaves[b].sum,
            };
        }

        // Slice out the nodes for the pollard
        if (level - 1 === offset + order) {
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

    const proposalQuorum = await rocketDAOProtocolSettingsProposal.getProposalQuorum();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProtocolProposal.getTotal(),
        ]).then(
            ([proposalTotal]) =>
                ({ proposalTotal }),
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Convert BNs to strings and calculate quorum
    let quorum = 0n;
    for (let i = 0; i < _treeNodes.length; i++) {
        quorum = quorum + _treeNodes[i].sum;

        treeNodes[i] = {
            sum: _treeNodes[i].sum.toString(),
            hash: _treeNodes[i].hash,
        };
    }
    quorum = quorum * proposalQuorum / '1'.ether;

    await rocketDAOProtocolProposal.connect(txOptions.from).propose(_proposalMessage, _payload, _block, treeNodes, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Get the current state, new proposal should be in pending
    let state = Number(await getDAOProposalState(ds2.proposalTotal));
    let votesRequired = await getDAOProposalVotesRequired(ds2.proposalTotal);

    // Check proposals
    assertBN.equal(ds2.proposalTotal, ds1.proposalTotal + 1n, 'Incorrect proposal total count');
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
    const rocketDAOProtocolVerifier = (await RocketDAOProtocolVerifier.deployed()).connect(txOptions.from);
    // Create the challenge
    await rocketDAOProtocolVerifier.createChallenge(_proposalID, _index, _node, _witness, txOptions);
}

export async function daoProtocolDefeatProposal(_proposalID, _index, txOptions) {
    // Load contracts
    const rocketDAOProtocolVerifier = (await RocketDAOProtocolVerifier.deployed()).connect(txOptions.from);
    // Create the challenge
    await rocketDAOProtocolVerifier.defeatProposal(_proposalID, _index, txOptions);
}

export async function daoProtocolSubmitRoot(_proposalID, _index, _treeNodes, txOptions) {
    _treeNodes = cloneLeaves(_treeNodes);
    // Load contracts
    const rocketDAOProtocolVerifier = (await RocketDAOProtocolVerifier.deployed()).connect(txOptions.from);
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
            rocketDAOProtocolProposal.getTotal(),
            rocketDAOProtocolProposal.getState(_proposalID),
            rocketDAOProtocolProposal.getVotingPowerFor(_proposalID),
            rocketDAOProtocolProposal.getVotingPowerRequired(_proposalID),
            rocketDAOProtocolProposal.getVotingPowerAgainst(_proposalID),
            rocketDAOProtocolProposal.getVotingPowerVeto(_proposalID),
            rocketDAOProtocolProposal.getReceiptDirection(_proposalID, txOptions.from),
        ]).then(
            ([proposalTotal, proposalState, proposalVotesFor, proposalVotesRequired, proposalVotesAgainst, proposalVotesVeto, direction]) =>
                ({
                    proposalTotal,
                    proposalState,
                    proposalVotesFor,
                    proposalVotesRequired,
                    proposalVotesAgainst,
                    proposalVotesVeto,
                    direction: direction,
                }),
        );
    }

    _witness = _witness.slice();
    for (let i = 0; i < _witness.length; i++) {
        _witness[i].sum = _witness[i].sum.toString();
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    await rocketDAOProtocolProposal.connect(txOptions.from).vote(_proposalID, _vote, _votingPower, _nodeIndex, _witness, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check proposals
    if (ds2.proposalState === proposalStates.Active) {
        assertBN.isBelow(ds2.proposalVotesFor, ds2.proposalVotesRequired, 'Proposal state is active, votes for proposal should be less than the votes required');
    }
    if (ds2.proposalState === proposalStates.Succeeded) {
        assertBN.isAtLeast(ds2.proposalVotesFor, ds2.proposalVotesRequired, 'Proposal state is successful, yet does not have the votes required');
    }

    const forDelta = ds2.proposalVotesFor - ds1.proposalVotesFor;
    const againstDelta = ds2.proposalVotesAgainst - ds1.proposalVotesAgainst;
    const vetoDelta = ds2.proposalVotesVeto - ds1.proposalVotesVeto;

    if (_vote === voteStates.For) {
        assertBN.equal(forDelta, _votingPower);
        assertBN.equal(againstDelta, 0n);
        assertBN.equal(vetoDelta, 0n);
    } else if (_vote === voteStates.Against) {
        assertBN.equal(forDelta, 0n);
        assertBN.equal(againstDelta, _votingPower);
        assertBN.equal(vetoDelta, 0n);
    } else if (_vote === voteStates.AgainstWithVeto) {
        assertBN.equal(forDelta, 0n);
        assertBN.equal(againstDelta, _votingPower);
        assertBN.equal(vetoDelta, _votingPower);
    } else {
        assertBN.equal(forDelta, 0n);
        assertBN.equal(againstDelta, 0n);
        assertBN.equal(vetoDelta, 0n);
    }
}

// Override vote on a proposal for this DAO
export async function daoProtocolOverrideVote(_proposalID, _vote, txOptions) {
    // Load contracts
    const rocketDAOProtocolProposal = (await RocketDAOProtocolProposal.deployed()).connect(txOptions.from);
    const rocketNetworkVoting = await RocketNetworkVoting.deployed();

    const proposalBlock = await rocketDAOProtocolProposal.getProposalBlock(_proposalID);
    const delegate = await rocketNetworkVoting.getDelegate(txOptions.from, proposalBlock);
    const votingPower = await rocketNetworkVoting.getVotingPower(txOptions.from, proposalBlock);

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProtocolProposal.getTotal(),
            rocketDAOProtocolProposal.getState(_proposalID),
            rocketDAOProtocolProposal.getVotingPowerFor(_proposalID),
            rocketDAOProtocolProposal.getVotingPowerRequired(_proposalID),
            rocketDAOProtocolProposal.getVotingPowerAgainst(_proposalID),
            rocketDAOProtocolProposal.getVotingPowerVeto(_proposalID),
            rocketDAOProtocolProposal.getReceiptDirection(_proposalID, txOptions.from),
            rocketDAOProtocolProposal.getReceiptDirection(_proposalID, delegate),
            rocketDAOProtocolProposal.getReceiptHasVotedPhase1(_proposalID, delegate),
        ]).then(
            ([proposalTotal, proposalState, proposalVotesFor, proposalVotesRequired, proposalVotesAgainst, proposalVotesVeto, direction, delegateDirection, delegateVotedPhase1]) =>
                ({
                    proposalTotal,
                    proposalState,
                    proposalVotesFor,
                    proposalVotesRequired,
                    proposalVotesAgainst,
                    proposalVotesVeto,
                    direction: Number(direction),
                    delegateDirection: Number(delegateDirection),
                    delegateVotedPhase1,
                }),
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Add a new proposal
    if (ds1.delegateVotedPhase1 && _vote === ds1.delegateDirection) {
        await shouldRevert(rocketDAOProtocolProposal.overrideVote(_proposalID, _vote, txOptions), 'Vote was accepted', 'Vote direction is the same as delegate');
        return;
    } else {
        await rocketDAOProtocolProposal.overrideVote(_proposalID, _vote, txOptions);
    }

    // Capture data
    let ds2 = await getTxData();

    const forDelta = ds2.proposalVotesFor - ds1.proposalVotesFor;
    const againstDelta = ds2.proposalVotesAgainst - ds1.proposalVotesAgainst;
    const vetoDelta = ds2.proposalVotesVeto - ds1.proposalVotesVeto;

    let expectedForDelta, expectedAgainstDelta;
    let expectedVetoDelta = 0n;

    if (!ds1.delegateVotedPhase1) {
        if (_vote === voteStates.For) {
            expectedForDelta = votingPower;
            expectedAgainstDelta = 0n;
        } else if (_vote === voteStates.Against) {
            expectedForDelta = 0n;
            expectedAgainstDelta = votingPower;
        } else if (_vote === voteStates.AgainstWithVeto) {
            expectedForDelta = 0n;
            expectedAgainstDelta = votingPower;
            expectedVetoDelta = votingPower;
        } else if (_vote === voteStates.Abstain) {
            expectedForDelta = 0n;
            expectedAgainstDelta = 0n;
        }
    } else if (ds1.delegateDirection === voteStates.For) {
        expectedForDelta = -votingPower;

        if (_vote !== voteStates.Abstain) {
            expectedAgainstDelta = votingPower;
        }

        if (_vote === voteStates.AgainstWithVeto) {
            expectedVetoDelta = votingPower;
        }
    } else if (ds1.delegateDirection === voteStates.Abstain) {
        if (_vote !== voteStates.For) {
            expectedForDelta = votingPower;
        } else if (_vote !== voteStates.Against) {
            expectedAgainstDelta = votingPower;
        } else {
            expectedAgainstDelta = votingPower;
            expectedVetoDelta = votingPower;
        }
    } else {
        expectedAgainstDelta = -votingPower;

        if (ds1.delegateDirection === voteStates.AgainstWithVeto) {
            expectedVetoDelta = -votingPower;
        }

        if (_vote !== voteStates.For) {
            expectedForDelta = votingPower;
        }
    }

    assertBN.equal(forDelta, expectedForDelta);
    assertBN.equal(againstDelta, expectedAgainstDelta);
    assertBN.equal(vetoDelta, expectedVetoDelta);
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
    const rocketDAOProtocolProposal = (await RocketDAOProtocolProposal.deployed()).connect(txOptions.from);

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProtocolProposal.getState(_proposalID),
        ]).then(
            ([proposalState]) =>
                ({ proposalState }),
        );
    }

    // Execute a proposal
    await rocketDAOProtocolProposal.execute(_proposalID, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check it was updated
    assertBN.equal(ds2.proposalState, proposalStates.Executed, 'Proposal is not in the executed state');
}

// Finalise a vetoed proposal
export async function daoProtocolFinalise(_proposalID, txOptions) {
    // Load contracts
    const rocketDAOProtocolProposal = (await RocketDAOProtocolProposal.deployed()).connect(txOptions.from);
    const rocketNodeStaking = await RocketNodeStaking.deployed();

    const proposer = await rocketDAOProtocolProposal.getProposer(_proposalID);
    const proposalBond = await getDaoProtocolProposalBond();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProtocolProposal.getState(_proposalID),
            rocketDAOProtocolProposal.getFinalised(_proposalID),
            rocketNodeStaking.getNodeLockedRPL(proposer),
            rocketNodeStaking.getNodeStakedRPL(proposer),
        ]).then(
            ([proposalState, finalised, lockedRPL, stakedRPL]) =>
                ({ proposalState, finalised, lockedRPL, stakedRPL }),
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Execute a proposal
    await rocketDAOProtocolProposal.finalise(_proposalID, txOptions);

    // Capture data
    let ds2 = await getTxData();

    const lockedDelta = ds2.lockedRPL - ds1.lockedRPL;
    const stakedDelta = ds2.stakedRPL - ds1.stakedRPL;

    // Check for bond burn of proposals staked RPL
    assertBN.equal(-lockedDelta, proposalBond);
    assertBN.equal(-stakedDelta, proposalBond);
    assert.equal(ds2.finalised, true);
}

export async function daoProtocolClaimBondProposer(_proposalID, _indices, txOptions) {
    const rocketDAOProtocolVerifier = (await RocketDAOProtocolVerifier.deployed()).connect(txOptions.from);
    const rocketNodeStaking = (await RocketNodeStaking.deployed()).connect(txOptions.from);
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    const lockedBalanceBefore = await rocketNodeStaking.getNodeLockedRPL(txOptions.from);
    const balanceBefore = await rocketNodeStaking.getNodeStakedRPL(txOptions.from);
    const supplyBefore = await rocketTokenRPL.totalSupply();

    await rocketDAOProtocolVerifier.claimBondProposer(_proposalID, _indices, txOptions);

    const lockedBalanceAfter = await rocketNodeStaking.getNodeLockedRPL(txOptions.from);
    const balanceAfter = await rocketNodeStaking.getNodeStakedRPL(txOptions.from);
    const supplyAfter = await rocketTokenRPL.totalSupply();

    return {
        staked: balanceAfter - balanceBefore,
        locked: lockedBalanceAfter - lockedBalanceBefore,
        burned: supplyBefore - supplyAfter,
    };
}

export async function daoProtocolClaimBondChallenger(_proposalID, _indices, txOptions) {
    const rocketDAOProtocolVerifier = (await RocketDAOProtocolVerifier.deployed()).connect(txOptions.from);
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    const lockedBalanceBefore = await rocketNodeStaking.getNodeLockedRPL(txOptions.from);
    const balanceBefore = await rocketNodeStaking.getNodeStakedRPL(txOptions.from);
    const supplyBefore = await rocketTokenRPL.totalSupply();

    await rocketDAOProtocolVerifier.claimBondChallenger(_proposalID, _indices, txOptions);

    const lockedBalanceAfter = await rocketNodeStaking.getNodeLockedRPL(txOptions.from);
    const balanceAfter = await rocketNodeStaking.getNodeStakedRPL(txOptions.from);
    const supplyAfter = await rocketTokenRPL.totalSupply();

    return {
        staked: balanceAfter - balanceBefore,
        locked: lockedBalanceAfter - lockedBalanceBefore,
        burned: supplyBefore - supplyAfter,
    };
}

export async function setDaoProtocolNodeShareSecurityCouncilAdder(_value, txOptions) {
    const rocketDAOProtocolSettingsNetwork = await RocketDAOProtocolSettingsNetwork.deployed();
    await rocketDAOProtocolSettingsNetwork.connect(txOptions.from).setNodeShareSecurityCouncilAdder(_value);

    // Check value was updated
    const valueAfter = await rocketDAOProtocolSettingsNetwork.getNodeShareSecurityCouncilAdder()
    assertBN.equal(valueAfter, _value);
}

export async function setDaoProtocolNodeCommissionShare(_value, txOptions) {
    const rocketDAOProtocolSettingsNetwork = await RocketDAOProtocolSettingsNetwork.deployed();
    await rocketDAOProtocolSettingsNetwork.connect(txOptions.from).setNodeCommissionShare(_value);

    // Check value was updated
    const valueAfter = await rocketDAOProtocolSettingsNetwork.getNodeShare()
    assertBN.equal(valueAfter, _value);
}

export async function setDaoProtocolVoterShare(_value, txOptions) {
    const rocketDAOProtocolSettingsNetwork = await RocketDAOProtocolSettingsNetwork.deployed();
    await rocketDAOProtocolSettingsNetwork.connect(txOptions.from).setVoterShare(_value);

    // Check value was updated
    const valueAfter = await rocketDAOProtocolSettingsNetwork.getVoterShare()
    assertBN.equal(valueAfter, _value);
}
