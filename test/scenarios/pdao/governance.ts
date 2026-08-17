import assert from "assert";
import { parseEther } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { PDAOTreeNode, ProtocolCurrent } from "../../harness";
import { PDAO_VOTE } from "../../harness";
import { depositMegapoolValidatorScenario } from "../megapool/deposit-validator";
import {
    constructTreeLeaves,
    delegatedVotingPower,
    generatePollard,
} from "./governance-tree";

export const PDAO_PROPOSAL = {
    pending: 0n,
    activePhase1: 1n,
    activePhase2: 2n,
    cancelled: 3n,
    vetoed: 4n,
    quorumNotMet: 5n,
    defeated: 6n,
    succeeded: 7n,
    expired: 8n,
    executed: 9n,
} as const;

export interface ValidPDAOProposal {
    block: bigint;
    id: bigint;
    power: bigint[];
    leaves: PDAOTreeNode[];
}

export interface BondDeltas {
    staked: bigint;
    locked: bigint;
    burned: bigint;
}

export async function createVotingNodeAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    validatorCount: number,
): Promise<void> {
    await protocol.nodes.register(node);
    const stake = parseEther("100") * BigInt(validatorCount);
    await protocol.tokens.mintRpl(node, stake);
    await protocol.nodes.stakeRpl(node, stake);
    for (let i = 0; i < validatorCount; i++) {
        await depositMegapoolValidatorScenario(protocol, node, { bond: parseEther("4") });
    }
    await protocol.nodes.setRplLockingAllowed(node, true);
    assert.equal(await protocol.nodes.stakedRpl(node), stake);
}

export async function nodeIndex(protocol: ProtocolCurrent, node: string): Promise<number> {
    const address = await protocol.nodes.address(node);
    const count = Number(await protocol.nodes.count());
    for (let index = 0; index < count; index++) {
        if (await protocol.nodes.at(BigInt(index)) === address) return index;
    }
    throw new Error(`Node ${node} was not found in the node index`);
}

export async function createValidPDAOProposalAndAssert(
    protocol: ProtocolCurrent,
    options: {
        caller: string;
        message?: string;
        payload?: string;
        block?: bigint;
        leaves?: PDAOTreeNode[];
    },
): Promise<ValidPDAOProposal> {
    const block = options.block ?? BigInt(await ethers.provider.getBlockNumber());
    const power = await delegatedVotingPower(protocol, block);
    const leaves = options.leaves ?? constructTreeLeaves(power);
    const depth = Number(await protocol.pdao.settings.proposals.depthPerRound());
    const pollard = generatePollard(leaves, depth);
    const totalBefore = await protocol.pdao.governance.proposals.total();
    const id = await protocol.pdao.governance.proposals.propose(
        options.message ?? "Test proposal",
        options.payload ?? "0x00",
        block,
        pollard,
        { caller: options.caller },
    );
    const details = await protocol.pdao.governance.proposals.details(id);
    const totalPower = pollard.reduce((sum, node) => sum + node.sum, 0n);
    const quorum = await protocol.pdao.settings.proposals.quorum();
    assert.equal(id, totalBefore + 1n);
    assert.equal(details.state, PDAO_PROPOSAL.pending);
    assert.equal(details.votingPowerRequired, totalPower * quorum / parseEther("1"));
    return { block, id, power, leaves };
}

export async function votePDAOAndAssert(
    protocol: ProtocolCurrent,
    proposalId: bigint,
    direction: bigint,
    votingPower: bigint,
    index: number,
    witness: readonly PDAOTreeNode[],
    options: { caller: string },
): Promise<void> {
    const before = await protocol.pdao.governance.proposals.details(proposalId);
    await protocol.pdao.governance.proposals.vote(
        proposalId, direction, votingPower, BigInt(index), witness, options,
    );
    const after = await protocol.pdao.governance.proposals.details(proposalId);
    assert.equal(after.votingPowerFor - before.votingPowerFor,
        direction === PDAO_VOTE.for ? votingPower : 0n);
    assert.equal(after.votingPowerAgainst - before.votingPowerAgainst,
        direction === PDAO_VOTE.against || direction === PDAO_VOTE.veto ? votingPower : 0n);
    assert.equal(after.votingPowerVeto - before.votingPowerVeto,
        direction === PDAO_VOTE.veto ? votingPower : 0n);
}

export async function executePDAOAndAssert(
    protocol: ProtocolCurrent,
    id: bigint,
    options: { caller: string },
): Promise<void> {
    await protocol.pdao.governance.proposals.execute(id, options);
    assert.equal((await protocol.pdao.governance.proposals.details(id)).state, PDAO_PROPOSAL.executed);
}

export async function finalisePDAOAndAssert(
    protocol: ProtocolCurrent,
    id: bigint,
    options: { caller: string },
): Promise<void> {
    const proposer = await protocol.contracts.rocketDAOProtocolProposal.getProposer(id);
    const bond = await protocol.pdao.governance.verifier.proposalBond(id);
    const staking = protocol.contracts.rocketNodeStaking;
    const [lockedBefore, stakedBefore] = await Promise.all([
        staking.getNodeLockedRPL(proposer),
        staking.getNodeStakedRPL(proposer),
    ]);
    await protocol.pdao.governance.proposals.finalise(id, options);
    assert.equal(await staking.getNodeLockedRPL(proposer), lockedBefore - bond);
    assert.equal(await staking.getNodeStakedRPL(proposer), stakedBefore - bond);
    assert.equal((await protocol.pdao.governance.proposals.details(id)).finalised, true);
}

async function claimDeltas(
    protocol: ProtocolCurrent,
    actor: string,
    action: () => Promise<void>,
): Promise<BondDeltas> {
    const address = await protocol.nodes.address(actor);
    const staking = protocol.contracts.rocketNodeStaking;
    const token = protocol.contracts.rocketTokenRPL;
    const [lockedBefore, stakedBefore, supplyBefore] = await Promise.all([
        staking.getNodeLockedRPL(address), staking.getNodeStakedRPL(address), token.totalSupply(),
    ]);
    await action();
    const [lockedAfter, stakedAfter, supplyAfter] = await Promise.all([
        staking.getNodeLockedRPL(address), staking.getNodeStakedRPL(address), token.totalSupply(),
    ]);
    return {
        locked: lockedAfter - lockedBefore,
        staked: stakedAfter - stakedBefore,
        burned: supplyBefore - supplyAfter,
    };
}

export function claimProposerBondAndMeasure(
    protocol: ProtocolCurrent,
    id: bigint,
    indices: readonly number[],
    options: { caller: string },
): Promise<BondDeltas> {
    return claimDeltas(protocol, options.caller, () =>
        protocol.pdao.governance.verifier.claimProposer(
            id, indices.map(BigInt), options,
        ));
}

export function claimChallengerBondAndMeasure(
    protocol: ProtocolCurrent,
    id: bigint,
    indices: readonly number[],
    options: { caller: string },
): Promise<BondDeltas> {
    return claimDeltas(protocol, options.caller, () =>
        protocol.pdao.governance.verifier.claimChallenger(
            id, indices.map(BigInt), options,
        ));
}
