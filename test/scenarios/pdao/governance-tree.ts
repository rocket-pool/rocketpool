import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { PDAOTreeNode, ProtocolCurrent } from "../../harness";

function parent(left: PDAOTreeNode, right: PDAOTreeNode): PDAOTreeNode {
    return {
        hash: ethers.solidityPackedKeccak256(
            ["bytes32", "uint256", "bytes32", "uint256"],
            [left.hash, left.sum, right.hash, right.sum],
        ),
        sum: left.sum + right.sum,
    };
}

export async function delegatedVotingPower(
    protocol: ProtocolCurrent,
    block: bigint,
): Promise<bigint[]> {
    const count = Number(await protocol.network.voting.nodeCount(block));
    const nodes = await Promise.all(Array.from({ length: count }, (_, index) => protocol.nodes.at(BigInt(index))));
    const rows = await Promise.all(nodes.map(async node => ({
        power: await protocol.contracts.rocketNetworkVoting.getVotingPower(node, block),
        delegate: await protocol.contracts.rocketNetworkVoting.getDelegate(node, block),
    })));
    return nodes.map(delegate => rows.reduce(
        (sum, row) => row.delegate === delegate ? sum + row.power : sum,
        0n,
    ));
}

export async function phase2VotingPower(
    protocol: ProtocolCurrent,
    block: bigint,
    nodeIndex: number,
): Promise<bigint[]> {
    const count = Number(await protocol.network.voting.nodeCount(block));
    const nodes = await Promise.all(Array.from({ length: count }, (_, index) => protocol.nodes.at(BigInt(index))));
    const delegate = nodes[nodeIndex];
    return Promise.all(nodes.map(async node => {
        const actualDelegate = await protocol.contracts.rocketNetworkVoting.getDelegate(node, block);
        return actualDelegate === delegate
            ? protocol.contracts.rocketNetworkVoting.getVotingPower(node, block)
            : 0n;
    }));
}

export function constructTreeLeaves(votingPower: readonly bigint[]): PDAOTreeNode[] {
    if (votingPower.length === 0) return [];
    const leafCount = 2 ** Math.ceil(Math.log2(votingPower.length));
    return Array.from({ length: leafCount }, (_, index) => {
        const sum = votingPower[index] ?? 0n;
        return {
            hash: ethers.solidityPackedKeccak256(["uint256"], [sum]),
            sum,
        };
    });
}

export function cloneTreeNodes(nodes: readonly PDAOTreeNode[]): PDAOTreeNode[] {
    return nodes.map(node => ({ ...node }));
}

export function depthFromIndex(index: number): number {
    return Math.floor(Math.log2(index));
}

export function generateVoteProof(
    source: readonly PDAOTreeNode[],
    leafIndex: number,
): { sum: bigint; witness: PDAOTreeNode[] } {
    const nodes = cloneTreeNodes(source);
    const sum = nodes[leafIndex].sum;
    const depth = Math.log2(nodes.length);
    let index = leafIndex + 2 ** depth;
    const witness: PDAOTreeNode[] = [];
    for (let level = depth; level > 0; level--) {
        const count = 2 ** level;
        for (let i = 0; i < count / 2; i++) {
            const left = i * 2;
            const right = left + 1;
            const offset = 2 ** level;
            if (offset + left === index) witness.push(nodes[right]);
            else if (offset + right === index) witness.push(nodes[left]);
            nodes[i] = parent(nodes[left], nodes[right]);
        }
        index = Math.floor(index / 2);
    }
    return { sum, witness };
}

export function generateChallengeProof(
    source: readonly PDAOTreeNode[],
    order: number,
    originalIndex = 1,
): { node: PDAOTreeNode; proof: PDAOTreeNode[] } {
    const nodes = cloneTreeNodes(source);
    let index = originalIndex;
    const offset = depthFromIndex(index);
    const depth = Math.log2(nodes.length);
    for (let level = depth; level > offset; level--) {
        const count = 2 ** level;
        for (let i = 0; i < count / 2; i++) {
            nodes[i] = parent(nodes[i * 2], nodes[i * 2 + 1]);
        }
    }
    const node = nodes[index - 2 ** offset];
    const proof: PDAOTreeNode[] = [];
    for (let level = offset; level > 0; level--) {
        const count = 2 ** level;
        for (let i = 0; i < count / 2; i++) {
            const left = i * 2;
            const right = left + 1;
            const indexOffset = 2 ** level;
            if (indexOffset + left === index) proof.push(nodes[right]);
            else if (indexOffset + right === index) proof.push(nodes[left]);
            nodes[i] = parent(nodes[left], nodes[right]);
        }
        index = Math.floor(index / 2);
    }
    let proofLength = order;
    if (offset === depth) proofLength = depth % order;
    if (proofLength === 0) proofLength = order;
    return { node, proof: proof.slice(0, proofLength) };
}

export function generatePollard(
    source: readonly PDAOTreeNode[],
    originalOrder: number,
    index = 1,
): PDAOTreeNode[] {
    const nodes = cloneTreeNodes(source);
    const offset = depthFromIndex(index);
    const depth = Math.log2(nodes.length);
    let order = originalOrder;
    if (order + offset > depth) order -= order + offset - depth;
    const size = 2 ** order;
    const pollardDepth = offset + order;
    const pollardOffset = index * size - 2 ** (order + offset);
    let pollard: PDAOTreeNode[] = depth === pollardDepth
        ? nodes.slice(pollardOffset, pollardOffset + size)
        : [];
    for (let level = depth; level > offset; level--) {
        const count = 2 ** level;
        for (let i = 0; i < count / 2; i++) {
            nodes[i] = parent(nodes[i * 2], nodes[i * 2 + 1]);
        }
        if (level - 1 === pollardDepth) {
            pollard = nodes.slice(pollardOffset, pollardOffset + size);
        }
    }
    return pollard;
}

export function subtreeIndex(globalIndex: number, leaves: readonly PDAOTreeNode[]): number {
    const depth = Math.log2(leaves.length);
    const phase2Depth = depthFromIndex(globalIndex) - depth;
    const root = Math.floor(globalIndex / 2 ** phase2Depth);
    const width = 2 ** phase2Depth;
    return globalIndex - root * width + width;
}

export function challengeIndices(finalIndex: number, leafCount: number, order: number): {
    phase1: number[];
    subroot: number;
    phase2: number[];
} {
    const phase1: number[] = [];
    const phase2: number[] = [];
    const phase1Depth = Math.ceil(Math.log2(leafCount));
    const phase2Depth = phase1Depth * 2;
    const subroot = finalIndex / 2 ** phase1Depth;
    const totalLeaves = 2 ** phase1Depth;
    const rounds = Math.max(1, Math.ceil(Math.floor(Math.log2(totalLeaves)) / order) - 1);
    for (let i = 1; i <= rounds; i++) {
        const depth = i * order;
        if (depth <= phase1Depth) {
            const index = subroot / 2 ** (phase1Depth - depth);
            if (index !== subroot) phase1.push(index);
        }
    }
    for (let i = 1; i <= rounds; i++) {
        const depth = phase1Depth + i * order;
        if (depth <= phase2Depth) phase2.push(finalIndex / 2 ** (phase2Depth - depth));
    }
    return { phase1, subroot, phase2 };
}
