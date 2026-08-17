import assert from "assert";
import { parseEther, ZeroHash } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import {
    before,
    describe,
    expectRevert,
    it,
    load,
    PDAO_VOTE,
    type PDAOBootstrapSetting,
    type PDAOTreeNode,
    type ProtocolCurrent,
} from "../../harness";
import {
    setBootstrapAddressListAndAssert,
    setBootstrapSettingAndAssert,
    setBootstrapSettingsAndAssert,
} from "../../scenarios/pdao/bootstrap-settings";
import {
    claimChallengerBondAndMeasure,
    claimProposerBondAndMeasure,
    createValidPDAOProposalAndAssert,
    createVotingNodeAndAssert,
    executePDAOAndAssert,
    finalisePDAOAndAssert,
    nodeIndex,
    PDAO_PROPOSAL,
    type ValidPDAOProposal,
    votePDAOAndAssert,
} from "../../scenarios/pdao/governance";
import {
    challengeIndices,
    cloneTreeNodes,
    constructTreeLeaves,
    delegatedVotingPower,
    generateChallengeProof,
    generatePollard,
    generateVoteProof,
    phase2VotingPower,
    subtreeIndex,
} from "../../scenarios/pdao/governance-tree";

const ONE = parseEther("1");
const VOTERS = Array.from({ length: 40 }, (_, offset) => `voter-${offset + 10}`);

const boolSetting = (contract: string, path: string, value: boolean): PDAOBootstrapSetting => ({
    contract, path, value: { type: "bool", value },
});
const uintSetting = (contract: string, path: string, value: bigint): PDAOBootstrapSetting => ({
    contract, path, value: { type: "uint", value },
});

async function advance(protocol: ProtocolCurrent, seconds: bigint): Promise<void> {
    await protocol.time.advance(seconds + 1n);
}

async function createProposal(
    protocol: ProtocolCurrent,
    options: { message?: string; payload?: string; block?: bigint; leaves?: PDAOTreeNode[] } = {},
): Promise<ValidPDAOProposal> {
    return createValidPDAOProposalAndAssert(protocol, { caller: "proposer", ...options });
}

async function voteAll(
    protocol: ProtocolCurrent,
    proposal: ValidPDAOProposal,
    direction: bigint,
): Promise<void> {
    for (const voter of VOTERS) {
        const index = await nodeIndex(protocol, voter);
        const proof = generateVoteProof(proposal.leaves, index);
        if (proof.sum === 0n) continue;
        try {
            await votePDAOAndAssert(protocol, proposal.id, direction, proof.sum, index, proof.witness, {
                caller: voter,
            });
        } catch (error) {
            if (error instanceof Error && error.message.includes("Proposal has passed")) return;
            throw error;
        }
    }
}

async function firstChallenge(
    protocol: ProtocolCurrent,
    proposal: ValidPDAOProposal,
    caller = "node1",
): Promise<number> {
    const order = Number(await protocol.pdao.settings.proposals.depthPerRound());
    const depth = Math.ceil(Math.log2(proposal.leaves.length));
    const index = challengeIndices(2 ** (depth * 2), proposal.leaves.length, order).phase1[0];
    const challenge = generateChallengeProof(proposal.leaves, order, index);
    await protocol.pdao.governance.verifier.createChallenge(
        proposal.id, BigInt(index), challenge.node, challenge.proof, { caller },
    );
    return index;
}

async function enableGovernance(protocol: ProtocolCurrent): Promise<void> {
    await protocol.pdao.bootstrap.enableGovernance();
}

describe("RocketDAOProtocol", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        const current = await rp131.upgradeTo("current");
        await current.depositPool.fund("depositor", parseEther("320"));
        await setBootstrapSettingAndAssert(current,
            uintSetting("rocketDAOProtocolSettingsNetwork", "network.submit.balances.frequency", 86_400n));
        await setBootstrapSettingAndAssert(current,
            uintSetting("rocketDAOProtocolSettingsRewards", "rewards.claimsperiods", 28n));
        await setBootstrapSettingAndAssert(current,
            uintSetting("rocketDAOProtocolSettingsMinipool", "minipool.maximum.count", 100n));
    });

    describe("bootstrap settings", () => {
        const multi = [
            boolSetting("rocketDAOProtocolSettingsAuction", "auction.lot.create.enabled", true),
            uintSetting("rocketDAOProtocolSettingsDeposit", "deposit.minimum", parseEther("2")),
            uintSetting("rocketDAOProtocolSettingsInflation", "rpl.inflation.interval.blocks", 400n),
        ];

        it("rejects a setting update from a non-guardian", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.pdao.bootstrap.setSetting(multi[0], { caller: "random" }),
                "Account is not a temporary guardian",
            );
        });

        it("rejects multiple setting updates from a non-guardian", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.pdao.bootstrap.setSettings(multi, { caller: "random" }),
                "Account is not a temporary guardian",
            );
        });

        it("updates a setting in each settings contract during bootstrap", async () => {
            const current = await load().ensure("current");
            await setBootstrapSettingsAndAssert(current, [
                ...multi,
                boolSetting("rocketDAOProtocolSettingsMinipool", "minipool.submit.withdrawable.enabled", true),
                boolSetting("rocketDAOProtocolSettingsNetwork", "network.submit.prices.enabled", true),
                uintSetting("rocketDAOProtocolSettingsRewards", "rpl.rewards.claim.period.blocks", 100n),
                uintSetting("rocketDAOProtocolSettingsInflation", "network.reth.deposit.delay", 500n),
            ]);
        });

        it("keeps the shortfall distribution delay at or above the regular delay", async () => {
            const current = await load().ensure("current");
            await setBootstrapSettingAndAssert(current,
                uintSetting("rocketDAOProtocolSettingsMegapool", "user.distribute.delay.shortfall", 10_000n));
            await setBootstrapSettingAndAssert(current,
                uintSetting("rocketDAOProtocolSettingsMegapool", "user.distribute.delay", 8_000n));
            await expectRevert(
                () => current.pdao.bootstrap.setSetting(
                    uintSetting("rocketDAOProtocolSettingsMegapool", "user.distribute.delay.shortfall", 7_000n)),
                "Value must be >= user.distribute.delay",
            );
            await expectRevert(
                () => current.pdao.bootstrap.setSetting(
                    uintSetting("rocketDAOProtocolSettingsMegapool", "user.distribute.delay", 11_000n)),
                "Value must be <= user.distribute.delay.shortfall",
            );
        });

        it("updates multiple settings together during bootstrap", async () => {
            await setBootstrapSettingsAndAssert(await load().ensure("current"), multi);
        });

        it("rejects a setting update after bootstrap is disabled", async () => {
            const current = await load().ensure("current");
            await setBootstrapSettingAndAssert(current, multi[0]);
            await enableGovernance(current);
            await current.pdao.bootstrap.disable();
            await expectRevert(() => current.pdao.bootstrap.setSetting(multi[0]), "Bootstrap mode not engaged");
        });

        it("rejects multiple setting updates after bootstrap is disabled", async () => {
            const current = await load().ensure("current");
            await setBootstrapSettingsAndAssert(current, multi);
            await enableGovernance(current);
            await current.pdao.bootstrap.disable();
            await expectRevert(() => current.pdao.bootstrap.setSettings(multi), "Bootstrap mode not engaged");
        });
    });

    describe("with node operators", () => {
        before(async () => {
            const current = await load().ensure("current");
            for (let offset = 0; offset < VOTERS.length; offset++) {
                const legacyIndex = offset + 10;
                await createVotingNodeAndAssert(current, VOTERS[offset], (legacyIndex * 7) % 5 + 1);
            }
            await createVotingNodeAndAssert(current, "proposer", 1);
        });

        it("rejects proposals until governance is enabled", async () => {
            const current = await load().ensure("current");
            await expectRevert(() => createProposal(current), "DAO has not been enabled");
        });

        it("only disables bootstrap after governance is enabled", async () => {
            const current = await load().ensure("current");
            await expectRevert(() => current.pdao.bootstrap.disable(), "On-chain governance must be enabled first");
            await enableGovernance(current);
            await current.pdao.bootstrap.disable();
            assert.equal(await current.pdao.bootstrap.disabled(), true);
        });

        describe("with governance enabled", () => {
            before(async () => {
                await enableGovernance(await load().ensure("current"));
            });

            it("submits a valid proposal", async () => {
                await createProposal(await load().ensure("current"));
            });

            it("rejects a proposal using a future block", async () => {
                const current = await load().ensure("current");
                const futureBlock = BigInt(await ethers.provider.getBlockNumber()) + 5n;
                await expectRevert(
                    () => createProposal(current, { block: futureBlock }),
                    "Block must be in the past",
                );
            });

            it("rejects proposals when the proposer disallows RPL locking", async () => {
                const current = await load().ensure("current");
                await current.nodes.setRplLockingAllowed("proposer", false);
                await expectRevert(() => createProposal(current), "Node is not allowed to lock RPL");
            });

            it("unlocks the proposal bond and permits excess RPL to be unstaked", async () => {
                const current = await load().ensure("current");
                await current.tokens.mintRpl("proposer", parseEther("2390"));
                await current.nodes.stakeRpl("proposer", parseEther("2390"));
                const proposal = await createProposal(current);
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await claimProposerBondAndMeasure(current, proposal.id, [1], { caller: "proposer" });
                await advance(current, 28n * 86_400n * 384n);
                await current.nodes.unstakeRpl("proposer", parseEther("150"));
            });

            it("rejects proposal pollards with an invalid leaf count", async () => {
                const current = await load().ensure("current");
                const block = BigInt(await ethers.provider.getBlockNumber());
                const leaves = constructTreeLeaves(await delegatedVotingPower(current, block));
                const order = Number(await current.pdao.settings.proposals.depthPerRound());
                await expectRevert(
                    () => current.pdao.governance.proposals.propose(
                        "Invalid", "0x00", block, generatePollard(leaves.slice(0, 1), order), { caller: "proposer" }),
                    "Invalid node count",
                );
                await expectRevert(
                    () => current.pdao.governance.proposals.propose(
                        "Invalid", "0x00", block, [...leaves, ...leaves], { caller: "proposer" }),
                    "Invalid node count",
                );
            });

            it("rejects claiming the proposer bond on a defeated proposal", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                const proposal = await createProposal(current);
                const index = await firstChallenge(current, proposal);
                await advance(current, await current.pdao.settings.proposals.challengePeriod());
                await current.pdao.governance.verifier.defeat(proposal.id, BigInt(index), { caller: "node1" });
                await expectRevert(
                    () => current.pdao.governance.verifier.claimProposer(proposal.id, [1n], { caller: "proposer" }),
                    "Proposal defeated",
                );
            });

            it("rejects claiming the proposer bond twice", async () => {
                const current = await load().ensure("current");
                const proposal = await createProposal(current);
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await claimProposerBondAndMeasure(current, proposal.id, [1], { caller: "proposer" });
                await expectRevert(
                    () => current.pdao.governance.verifier.claimProposer(proposal.id, [1n], { caller: "proposer" }),
                    "Invalid challenge state",
                );
            });

            it("rejects claiming an invalid-challenge reward twice", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                const proposal = await createProposal(current);
                const index = await firstChallenge(current, proposal);
                const order = Number(await current.pdao.settings.proposals.depthPerRound());
                await current.pdao.governance.verifier.submitRoot(
                    proposal.id, BigInt(index), generatePollard(proposal.leaves, order, index), { caller: "proposer" },
                );
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await claimProposerBondAndMeasure(current, proposal.id, [1, index], { caller: "proposer" });
                await expectRevert(
                    () => current.pdao.governance.verifier.claimProposer(
                        proposal.id, [BigInt(index)], { caller: "proposer" }),
                    "Invalid challenge state",
                );
            });

            it("rejects claiming a reward for an unanswered challenge", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                const proposal = await createProposal(current);
                const index = await firstChallenge(current, proposal);
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await expectRevert(
                    () => current.pdao.governance.verifier.claimProposer(
                        proposal.id, [BigInt(index)], { caller: "proposer" }),
                    "Invalid challenge state",
                );
            });

            it("rejects claiming a reward for an unchallenged index", async () => {
                const current = await load().ensure("current");
                const proposal = await createProposal(current);
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await expectRevert(
                    () => current.pdao.governance.verifier.claimProposer(proposal.id, [2n], { caller: "proposer" }),
                    "Invalid challenge state",
                );
            });

            it("rejects invalid pollards submitted in response to a challenge", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                const proposal = await createProposal(current);
                const index = await firstChallenge(current, proposal);
                const order = Number(await current.pdao.settings.proposals.depthPerRound());
                const pollard = generatePollard(proposal.leaves, order, index);
                await expectRevert(
                    () => current.pdao.governance.verifier.submitRoot(
                        proposal.id, BigInt(index), pollard.slice(0, 1), { caller: "proposer" }),
                    "Invalid node count",
                );
                const invalidSum = cloneTreeNodes(pollard);
                invalidSum[0].sum += 1n;
                await expectRevert(
                    () => current.pdao.governance.verifier.submitRoot(
                        proposal.id, BigInt(index), invalidSum, { caller: "proposer" }),
                    "Invalid sum",
                );
                const invalidHash = cloneTreeNodes(pollard);
                invalidHash[0].hash = ZeroHash;
                await expectRevert(
                    () => current.pdao.governance.verifier.submitRoot(
                        proposal.id, BigInt(index), invalidHash, { caller: "proposer" }),
                    "Invalid hash",
                );
            });

            it("rejects an invalid phase-two leaf", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                const block = BigInt(await ethers.provider.getBlockNumber());
                const power = await delegatedVotingPower(current, block);
                power[0] = parseEther("1000");
                const leaves = constructTreeLeaves(power);
                const proposal = await createProposal(current, { block, leaves });
                const order = Number(await current.pdao.settings.proposals.depthPerRound());
                const depth = Math.ceil(Math.log2(leaves.length));
                const indices = challengeIndices(2 ** (depth * 2), leaves.length, order);
                for (const index of indices.phase1) {
                    const proof = generateChallengeProof(leaves, order, index);
                    await current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" });
                    await current.pdao.governance.verifier.submitRoot(
                        proposal.id, BigInt(index), generatePollard(leaves, order, index), { caller: "proposer" });
                }
                const rootProof = generateChallengeProof(leaves, order, indices.subroot);
                await current.pdao.governance.verifier.createChallenge(
                    proposal.id, BigInt(indices.subroot), rootProof.node, rootProof.proof, { caller: "node1" });
                const subtreePower = await phase2VotingPower(current, block, indices.subroot - 2 ** depth);
                subtreePower[0] = parseEther("1000");
                const subtree = constructTreeLeaves(subtreePower);
                const rootSubindex = subtreeIndex(indices.subroot, subtree);
                await current.pdao.governance.verifier.submitRoot(
                    proposal.id, BigInt(indices.subroot), generatePollard(subtree, order, rootSubindex), { caller: "proposer" });
                for (const index of indices.phase2.slice(0, -1)) {
                    const local = subtreeIndex(index, subtree);
                    const proof = generateChallengeProof(subtree, order, local);
                    await current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" });
                    await current.pdao.governance.verifier.submitRoot(
                        proposal.id, BigInt(index), generatePollard(subtree, order, local), { caller: "proposer" });
                }
                const finalIndex = indices.phase2.at(-1)!;
                const local = subtreeIndex(finalIndex, subtree);
                const proof = generateChallengeProof(subtree, order, local);
                await current.pdao.governance.verifier.createChallenge(
                    proposal.id, BigInt(finalIndex), proof.node, proof.proof, { caller: "node1" });
                await expectRevert(
                    () => current.pdao.governance.verifier.submitRoot(
                        proposal.id, BigInt(finalIndex), generatePollard(subtree, order, local), { caller: "proposer" }),
                    "Invalid leaves",
                );
            });

            it("rejects an invalid primary-tree leaf hash", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                const block = BigInt(await ethers.provider.getBlockNumber());
                const leaves = constructTreeLeaves(await delegatedVotingPower(current, block));
                leaves[0].sum += 100_000n;
                const proposal = await createProposal(current, { block, leaves });
                const order = Number(await current.pdao.settings.proposals.depthPerRound());
                const depth = Math.ceil(Math.log2(leaves.length));
                const indices = challengeIndices(2 ** (depth * 2), leaves.length, order);
                for (const index of indices.phase1) {
                    const proof = generateChallengeProof(leaves, order, index);
                    await current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" });
                    await current.pdao.governance.verifier.submitRoot(
                        proposal.id, BigInt(index), generatePollard(leaves, order, index), { caller: "proposer" });
                }
                const proof = generateChallengeProof(leaves, order, indices.subroot);
                await current.pdao.governance.verifier.createChallenge(
                    proposal.id, BigInt(indices.subroot), proof.node, proof.proof, { caller: "node1" });
                const subtree = constructTreeLeaves(
                    await phase2VotingPower(current, block, indices.subroot - 2 ** depth),
                );
                subtree[0].sum += 100_000n;
                await expectRevert(
                    () => current.pdao.governance.verifier.submitRoot(
                        proposal.id,
                        BigInt(indices.subroot),
                        generatePollard(subtree, order, subtreeIndex(indices.subroot, subtree)),
                        { caller: "proposer" },
                    ),
                    "Invalid hash",
                );
            });

            it("rejects setting the same voting delegate twice", async () => {
                const current = await load().ensure("current");
                await current.network.voting.setDelegate(VOTERS[0], VOTERS[1]);
                await expectRevert(
                    () => current.network.voting.setDelegate(VOTERS[0], VOTERS[1]),
                    "Delegate already set to value",
                );
            });

            it("lets a voter override its delegate with an opposing vote", async () => {
                const current = await load().ensure("current");
                await current.network.voting.setDelegate(VOTERS[0], VOTERS[1]);
                const proposal = await createProposal(current);
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await voteAll(current, proposal, PDAO_VOTE.for);
                await advance(current, await current.pdao.settings.proposals.phase1Time());
                await current.pdao.governance.proposals.overrideVote(
                    proposal.id, PDAO_VOTE.against, { caller: VOTERS[0] });
            });

            it("rejects an override in the same direction as the delegate", async () => {
                const current = await load().ensure("current");
                await current.network.voting.setDelegate(VOTERS[0], VOTERS[1]);
                const proposal = await createProposal(current);
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await voteAll(current, proposal, PDAO_VOTE.for);
                await advance(current, await current.pdao.settings.proposals.phase1Time());
                await expectRevert(
                    () => current.pdao.governance.proposals.overrideVote(
                        proposal.id, PDAO_VOTE.for, { caller: VOTERS[0] }),
                    "Vote direction is the same as delegate",
                );
            });

            it("allows delegator and delegate to vote alike in phase two", async () => {
                const current = await load().ensure("current");
                await current.network.voting.setDelegate(VOTERS[0], VOTERS[1]);
                const proposal = await createProposal(current);
                await advance(current,
                    await current.pdao.settings.proposals.voteDelay()
                    + await current.pdao.settings.proposals.phase1Time());
                await current.pdao.governance.proposals.overrideVote(
                    proposal.id, PDAO_VOTE.for, { caller: VOTERS[1] });
                await current.pdao.governance.proposals.overrideVote(
                    proposal.id, PDAO_VOTE.for, { caller: VOTERS[0] });
            });

            it("rejects overriding a phase-one vote in phase two", async () => {
                const current = await load().ensure("current");
                await current.network.voting.setDelegate(VOTERS[0], VOTERS[1]);
                const proposal = await createProposal(current);
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                const index = await nodeIndex(current, VOTERS[1]);
                const proof = generateVoteProof(proposal.leaves, index);
                await votePDAOAndAssert(current, proposal.id, PDAO_VOTE.for,
                    proof.sum, index, proof.witness, { caller: VOTERS[1] });
                await advance(current, await current.pdao.settings.proposals.phase1Time());
                await expectRevert(
                    () => current.pdao.governance.proposals.overrideVote(
                        proposal.id, PDAO_VOTE.against, { caller: VOTERS[1] }),
                    "Node operator has already voted on proposal",
                );
            });

            it("rejects executing a failed proposal", async () => {
                const current = await load().ensure("current");
                const payload = current.contracts.rocketDAOProtocolProposals.interface.encodeFunctionData(
                    "proposalSecurityInvite", ["Security Member 1", await current.nodes.address("securityMember")],
                );
                const proposal = await createProposal(current, { payload });
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await voteAll(current, proposal, PDAO_VOTE.against);
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await expectRevert(
                    () => current.pdao.governance.proposals.execute(proposal.id, { caller: "proposer" }),
                    "Proposal has not succeeded, has expired or has already been executed",
                );
                await expectRevert(
                    () => current.pdao.security.members.join("securityMember"),
                    "This address has not been invited to join",
                );
            });

            it("rejects executing a vetoed proposal and permits finalisation", async () => {
                const current = await load().ensure("current");
                const payload = current.contracts.rocketDAOProtocolProposals.interface.encodeFunctionData(
                    "proposalSecurityInvite", ["Security Member 1", await current.nodes.address("securityMember")],
                );
                const proposal = await createProposal(current, { payload });
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await voteAll(current, proposal, PDAO_VOTE.veto);
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await expectRevert(
                    () => current.pdao.governance.proposals.execute(proposal.id, { caller: "proposer" }),
                    "Proposal has not succeeded, has expired or has already been executed",
                );
                await finalisePDAOAndAssert(current, proposal.id, { caller: "proposer" });
            });

            it("invites a security council member through governance", async () => {
                const current = await load().ensure("current");
                const payload = current.contracts.rocketDAOProtocolProposals.interface.encodeFunctionData(
                    "proposalSecurityInvite", ["Security Member 1", await current.nodes.address("securityMember")],
                );
                const proposal = await createProposal(current, { payload });
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await voteAll(current, proposal, PDAO_VOTE.for);
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await executePDAOAndAssert(current, proposal.id, { caller: "proposer" });
                await current.pdao.security.members.join("securityMember");
                assert.equal(await current.pdao.security.members.isMember("securityMember"), true);
            });

            it("kicks a security council member through governance", async () => {
                const current = await load().ensure("current");
                await current.pdao.security.members.invite("securityMember", { id: "Member" });
                await current.pdao.security.members.join("securityMember");
                const payload = current.contracts.rocketDAOProtocolProposals.interface.encodeFunctionData(
                    "proposalSecurityKick", [await current.nodes.address("securityMember")],
                );
                const proposal = await createProposal(current, { payload });
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await voteAll(current, proposal, PDAO_VOTE.for);
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await executePDAOAndAssert(current, proposal.id, { caller: "proposer" });
                assert.equal(await current.pdao.security.members.isMember("securityMember"), false);
            });

            it("rejects kicking a security council member that does not exist", async () => {
                const current = await load().ensure("current");
                const payload = current.contracts.rocketDAOProtocolProposals.interface.encodeFunctionData(
                    "proposalSecurityKick", [await current.nodes.address("random")],
                );
                const proposal = await createProposal(current, { payload });
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await voteAll(current, proposal, PDAO_VOTE.for);
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await expectRevert(
                    () => current.pdao.governance.proposals.execute(proposal.id, { caller: "proposer" }),
                    "This node is not part of the security council",
                );
            });

            it("replaces a security council member through governance", async () => {
                const current = await load().ensure("current");
                await current.pdao.security.members.invite("securityMember", { id: "Member" });
                await current.pdao.security.members.join("securityMember");
                const payload = current.contracts.rocketDAOProtocolProposals.interface.encodeFunctionData(
                    "proposalSecurityReplace",
                    [await current.nodes.address("securityMember"), "Replacement", await current.nodes.address("random")],
                );
                const proposal = await createProposal(current, { payload });
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await voteAll(current, proposal, PDAO_VOTE.for);
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await executePDAOAndAssert(current, proposal.id, { caller: "proposer" });
                await current.pdao.security.members.join("random");
                assert.equal(await current.pdao.security.members.isMember("securityMember"), false);
                assert.equal(await current.pdao.security.members.isMember("random"), true);
            });

            it("rejects a challenge when the challenger has insufficient RPL", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                await current.pdao.bootstrap.setSetting(
                    uintSetting("rocketDAOProtocolSettingsProposals", "proposal.challenge.bond", parseEther("10000")),
                );
                const proposal = await createProposal(current);
                const order = Number(await current.pdao.settings.proposals.depthPerRound());
                const depth = Math.ceil(Math.log2(proposal.leaves.length));
                const index = challengeIndices(2 ** (depth * 2), proposal.leaves.length, order).phase1[0];
                const proof = generateChallengeProof(proposal.leaves, order, index);
                await expectRevert(
                    () => current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" }),
                    "Not enough staked RPL",
                );
            });

            it("rejects a challenge when the challenger disallows RPL locking", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                await current.nodes.setRplLockingAllowed("node1", false);
                const proposal = await createProposal(current);
                const order = Number(await current.pdao.settings.proposals.depthPerRound());
                const depth = Math.ceil(Math.log2(proposal.leaves.length));
                const index = challengeIndices(2 ** (depth * 2), proposal.leaves.length, order).phase1[0];
                const proof = generateChallengeProof(proposal.leaves, order, index);
                await expectRevert(
                    () => current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" }),
                    "Node is not allowed to lock RPL",
                );
            });

            it("awards the challenger share after defeating a proposal", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                const proposal = await createProposal(current);
                const index = await firstChallenge(current, proposal);
                const challengeBond = await current.pdao.governance.verifier.challengeBond(proposal.id);
                const proposalBond = await current.pdao.governance.verifier.proposalBond(proposal.id);
                await advance(current, await current.pdao.governance.verifier.challengePeriod(proposal.id));
                await current.pdao.governance.verifier.defeat(proposal.id, BigInt(index), { caller: "node1" });
                const deltas = await claimChallengerBondAndMeasure(current, proposal.id, [index], { caller: "node1" });
                assert.equal(deltas.locked, -challengeBond);
                assert.equal(deltas.staked, proposalBond * 80n / 100n);
                assert.equal(deltas.burned, proposalBond * 20n / 100n);
            });

            it("returns a challenger bond for an unused index", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                const proposal = await createProposal(current);
                const index = await firstChallenge(current, proposal);
                const bond = await current.pdao.governance.verifier.challengeBond(proposal.id);
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                const deltas = await claimChallengerBondAndMeasure(current, proposal.id, [index], { caller: "node1" });
                assert.equal(deltas.locked, -bond);
                assert.equal(deltas.staked, 0n);
                assert.equal(deltas.burned, 0n);
            });

            it("rejects claiming a challenge reward made by another node", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                await createVotingNodeAndAssert(current, "node2", 1);
                const proposal = await createProposal(current);
                const index = await firstChallenge(current, proposal, "node1");
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await expectRevert(
                    () => current.pdao.governance.verifier.claimChallenger(
                        proposal.id, [BigInt(index)], { caller: "node2" }),
                    "Invalid challenger",
                );
            });

            it("rejects claiming another node's proposer bond", async () => {
                const current = await load().ensure("current");
                await createVotingNodeAndAssert(current, "node1", 1);
                const proposal = await createProposal(current);
                await advance(current, await current.pdao.settings.proposals.voteDelay());
                await advance(current,
                    await current.pdao.settings.proposals.phase1Time()
                    + await current.pdao.settings.proposals.phase2Time());
                await expectRevert(
                    () => current.pdao.governance.verifier.claimProposer(proposal.id, [1n], { caller: "node1" }),
                    "Not proposer",
                );
            });

            describe("with a valid pending proposal", () => {
                let proposal: ValidPDAOProposal;
                let order: number;
                let indices: ReturnType<typeof challengeIndices>;

                before(async () => {
                    const current = await load().ensure("current");
                    await createVotingNodeAndAssert(current, "node1", 1);
                    proposal = await createProposal(current);
                    order = Number(await current.pdao.settings.proposals.depthPerRound());
                    const depth = Math.ceil(Math.log2(proposal.leaves.length));
                    indices = challengeIndices(2 ** (depth * 2), proposal.leaves.length, order);
                });

                it("refutes an invalid challenge through every tree round", async () => {
                    const current = await load().ensure("current");
                    for (const index of indices.phase1) {
                        const proof = generateChallengeProof(proposal.leaves, order, index);
                        await current.pdao.governance.verifier.createChallenge(
                            proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" });
                        await current.pdao.governance.verifier.submitRoot(
                            proposal.id, BigInt(index), generatePollard(proposal.leaves, order, index), { caller: "proposer" });
                    }
                    const rootProof = generateChallengeProof(proposal.leaves, order, indices.subroot);
                    await current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(indices.subroot), rootProof.node, rootProof.proof, { caller: "node1" });
                    const depth = Math.ceil(Math.log2(proposal.leaves.length));
                    const subtree = constructTreeLeaves(
                        await phase2VotingPower(current, proposal.block, indices.subroot - 2 ** depth),
                    );
                    await current.pdao.governance.verifier.submitRoot(
                        proposal.id,
                        BigInt(indices.subroot),
                        generatePollard(subtree, order, subtreeIndex(indices.subroot, subtree)),
                        { caller: "proposer" },
                    );
                    for (const index of indices.phase2) {
                        const local = subtreeIndex(index, subtree);
                        const proof = generateChallengeProof(subtree, order, local);
                        await current.pdao.governance.verifier.createChallenge(
                            proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" });
                        await current.pdao.governance.verifier.submitRoot(
                            proposal.id, BigInt(index), generatePollard(subtree, order, local), { caller: "proposer" });
                    }
                });

                it("rejects challenge responses after voting starts", async () => {
                    const current = await load().ensure("current");
                    const index = indices.phase1[0];
                    const proof = generateChallengeProof(proposal.leaves, order, index);
                    await current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" });
                    await advance(current, await current.pdao.settings.proposals.voteDelay());
                    await expectRevert(
                        () => current.pdao.governance.verifier.submitRoot(
                            proposal.id, BigInt(index), generatePollard(proposal.leaves, order, index), { caller: "proposer" }),
                        "Can not submit root for a valid proposal",
                    );
                });

                it("claims the proposal bond after voting expires", async () => {
                    const current = await load().ensure("current");
                    const bond = await current.pdao.governance.verifier.proposalBond(proposal.id);
                    await advance(current, await current.pdao.settings.proposals.voteDelay());
                    await advance(current,
                        await current.pdao.settings.proposals.phase1Time()
                        + await current.pdao.settings.proposals.phase2Time());
                    const deltas = await claimProposerBondAndMeasure(current, proposal.id, [1], { caller: "proposer" });
                    assert.deepEqual(deltas, { locked: -bond, staked: 0n, burned: 0n });
                });

                it("claims and burns the expected share of an invalid challenge", async () => {
                    const current = await load().ensure("current");
                    const index = indices.phase1[0];
                    const proof = generateChallengeProof(proposal.leaves, order, index);
                    await current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" });
                    await current.pdao.governance.verifier.submitRoot(
                        proposal.id, BigInt(index), generatePollard(proposal.leaves, order, index), { caller: "proposer" });
                    const proposalBond = await current.pdao.governance.verifier.proposalBond(proposal.id);
                    const challengeBond = await current.pdao.governance.verifier.challengeBond(proposal.id);
                    await advance(current, await current.pdao.settings.proposals.voteDelay());
                    await advance(current,
                        await current.pdao.settings.proposals.phase1Time()
                        + await current.pdao.settings.proposals.phase2Time());
                    const deltas = await claimProposerBondAndMeasure(
                        current, proposal.id, [1, index], { caller: "proposer" });
                    assert.equal(deltas.locked, -proposalBond);
                    assert.equal(deltas.staked, challengeBond * 80n / 100n);
                    assert.equal(deltas.burned, challengeBond * 20n / 100n);
                });

                it("rejects a second proposal when the first bond exhausts available RPL", async () => {
                    const current = await load().ensure("current");
                    await expectRevert(() => createProposal(current), "Not enough staked RPL");
                });

                it("rejects a challenge using a proof from a deeper index", async () => {
                    const current = await load().ensure("current");
                    const index = indices.phase1[0];
                    const proof = generateChallengeProof(proposal.leaves, order, indices.phase1[1]);
                    await expectRevert(
                        () => current.pdao.governance.verifier.createChallenge(
                            proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" }),
                        "Invalid proof length",
                    );
                });

                it("returns a challenger bond when the proposal remains valid", async () => {
                    const current = await load().ensure("current");
                    const index = indices.phase1[0];
                    const proof = generateChallengeProof(proposal.leaves, order, index);
                    await current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" });
                    const bond = await current.pdao.governance.verifier.challengeBond(proposal.id);
                    await advance(current, await current.pdao.settings.proposals.voteDelay());
                    await advance(current,
                        await current.pdao.settings.proposals.phase1Time()
                        + await current.pdao.settings.proposals.phase2Time());
                    assert.deepEqual(
                        await claimChallengerBondAndMeasure(current, proposal.id, [index], { caller: "node1" }),
                        { locked: -bond, staked: 0n, burned: 0n },
                    );
                });

                it("rejects claiming the same challenge bond twice", async () => {
                    const current = await load().ensure("current");
                    const index = indices.phase1[0];
                    const proof = generateChallengeProof(proposal.leaves, order, index);
                    await current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" });
                    await advance(current, await current.pdao.governance.verifier.challengePeriod(proposal.id));
                    await current.pdao.governance.verifier.defeat(proposal.id, BigInt(index), { caller: "node1" });
                    await claimChallengerBondAndMeasure(current, proposal.id, [index], { caller: "node1" });
                    await expectRevert(
                        () => current.pdao.governance.verifier.claimChallenger(
                            proposal.id, [BigInt(index)], { caller: "node1" }),
                        "Invalid challenge state",
                    );
                });

                it("rejects a challenge index deeper than the maximum tree depth", async () => {
                    const current = await load().ensure("current");
                    const depth = Math.ceil(Math.log2(proposal.leaves.length)) * 2;
                    await expectRevert(
                        () => current.pdao.governance.verifier.createChallenge(
                            proposal.id, BigInt(2 ** (depth + 1)), proposal.leaves[0], [], { caller: "node1" }),
                        "Invalid index depth",
                    );
                });

                it("rejects defeating a proposal before the challenge period passes", async () => {
                    const current = await load().ensure("current");
                    const index = await firstChallenge(current, proposal);
                    await expectRevert(
                        () => current.pdao.governance.verifier.defeat(
                            proposal.id, BigInt(index), { caller: "node1" }),
                        "Not enough time has passed",
                    );
                });

                it("rejects defeating a proposal after it becomes active", async () => {
                    const current = await load().ensure("current");
                    const index = await firstChallenge(current, proposal);
                    await advance(current, await current.pdao.settings.proposals.voteDelay());
                    await expectRevert(
                        () => current.pdao.governance.verifier.defeat(
                            proposal.id, BigInt(index), { caller: "node1" }),
                        "Can not defeat a valid proposal",
                    );
                });

                it("rejects claiming a challenger bond while the proposal is pending", async () => {
                    const current = await load().ensure("current");
                    const index = await firstChallenge(current, proposal);
                    await expectRevert(
                        () => current.pdao.governance.verifier.claimChallenger(
                            proposal.id, [BigInt(index)], { caller: "node1" }),
                        "Can not claim bond while proposal is Pending",
                    );
                });

                it("rejects challenging the same index twice", async () => {
                    const current = await load().ensure("current");
                    const index = indices.phase1[0];
                    const proof = generateChallengeProof(proposal.leaves, order, index);
                    await current.pdao.governance.verifier.createChallenge(
                        proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" });
                    await expectRevert(
                        () => current.pdao.governance.verifier.createChallenge(
                            proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" }),
                        "Index already challenged",
                    );
                });

                it("rejects challenging an index whose parent was not challenged", async () => {
                    const current = await load().ensure("current");
                    const proof = generateChallengeProof(proposal.leaves, order, indices.subroot);
                    await expectRevert(
                        () => current.pdao.governance.verifier.createChallenge(
                            proposal.id, BigInt(indices.subroot), proof.node, proof.proof, { caller: "node1" }),
                        "Invalid challenge depth",
                    );
                });

                it("rejects further challenges after the proposal is defeated", async () => {
                    const current = await load().ensure("current");
                    const index = await firstChallenge(current, proposal);
                    await advance(current, await current.pdao.governance.verifier.challengePeriod(proposal.id));
                    await current.pdao.governance.verifier.defeat(proposal.id, BigInt(index), { caller: "node1" });
                    const next = generateChallengeProof(proposal.leaves, order, index + 1);
                    await expectRevert(
                        () => current.pdao.governance.verifier.createChallenge(
                            proposal.id, BigInt(index + 1), next.node, next.proof, { caller: "node1" }),
                        "Can only challenge while proposal is Pending",
                    );
                });

                it("rejects challenges after the pending period", async () => {
                    const current = await load().ensure("current");
                    await advance(current, await current.pdao.settings.proposals.voteDelay());
                    const index = indices.phase1[0];
                    const proof = generateChallengeProof(proposal.leaves, order, index);
                    await expectRevert(
                        () => current.pdao.governance.verifier.createChallenge(
                            proposal.id, BigInt(index), proof.node, proof.proof, { caller: "node1" }),
                        "Can only challenge while proposal is Pending",
                    );
                });

                it("rejects claiming a challenger bond for an invalid index or claimant", async () => {
                    const current = await load().ensure("current");
                    const index = await firstChallenge(current, proposal);
                    await advance(current, await current.pdao.governance.verifier.challengePeriod(proposal.id));
                    await current.pdao.governance.verifier.defeat(proposal.id, BigInt(index), { caller: "node1" });
                    await expectRevert(
                        () => current.pdao.governance.verifier.claimChallenger(
                            proposal.id, [BigInt(indices.phase2[0])], { caller: "proposer" }),
                        "Invalid challenge state",
                    );
                    await expectRevert(
                        () => current.pdao.governance.verifier.claimChallenger(
                            proposal.id, [1n], { caller: "proposer" }),
                        "Invalid challenger",
                    );
                });
            });
        });
    });

    describe("with an allow-listed controller", () => {
        before(async () => {
            await setBootstrapAddressListAndAssert(
                await load().ensure("current"),
                "rocketDAOProtocolSettingsNetwork",
                "network.allow.listed.controllers",
                ["controller"],
            );
        });

        it("rejects network-share updates from an address outside the allow list", async () => {
            const network = (await load().ensure("current")).pdao.settings.network;
            await expectRevert(() => network.setNodeShareSecurityCouncilAdder(parseEther("0.005"), { caller: "random" }), "Not on allow list");
            await expectRevert(() => network.setNodeShare(parseEther("0.15"), { caller: "random" }), "Not on allow list");
            await expectRevert(() => network.setVoterShare(parseEther("0.15"), { caller: "random" }), "Not on allow list");
        });

        it("updates the security-council node-share adder from an allow-listed controller", async () => {
            const network = (await load().ensure("current")).pdao.settings.network;
            await network.setNodeShareSecurityCouncilAdder(parseEther("0.005"), { caller: "controller" });
            assert.equal(await network.nodeShareSecurityCouncilAdder(), parseEther("0.005"));
        });

        it("rejects updates after the controller is removed from the allow list", async () => {
            const current = await load().ensure("current");
            await current.pdao.bootstrap.setAddressList(
                "rocketDAOProtocolSettingsNetwork", "network.allow.listed.controllers", []);
            await expectRevert(
                () => current.pdao.settings.network.setNodeShareSecurityCouncilAdder(
                    parseEther("0.005"), { caller: "controller" }),
                "Not on allow list",
            );
        });

        it("caps the security-council node-share adder", async () => {
            const network = (await load().ensure("current")).pdao.settings.network;
            const maximum = await network.maximumSecurityCouncilAdder();
            await network.setNodeShareSecurityCouncilAdder(maximum, { caller: "controller" });
            await expectRevert(
                () => network.setNodeShareSecurityCouncilAdder(
                    maximum + parseEther("0.00001"), { caller: "controller" }),
                "Value must be <= max value",
            );
        });

        it("keeps node and voter shares at or below 100%", async () => {
            const network = (await load().ensure("current")).pdao.settings.network;
            await network.setNodeShare(parseEther("0.5"), { caller: "controller" });
            await network.setVoterShare(parseEther("0.5"), { caller: "controller" });
            await expectRevert(
                () => network.setNodeShare(parseEther("0.51"), { caller: "controller" }),
                "rETH Commission must be <= 100%",
            );
        });

        it("updates the node commission share from an allow-listed controller", async () => {
            const network = (await load().ensure("current")).pdao.settings.network;
            await network.setNodeShare(parseEther("0.10"), { caller: "controller" });
            assert.equal(await network.nodeShare(), parseEther("0.10"));
        });

        it("updates the voter share from an allow-listed controller", async () => {
            const network = (await load().ensure("current")).pdao.settings.network;
            await network.setVoterShare(parseEther("0.20"), { caller: "controller" });
            assert.equal(await network.voterShare(), parseEther("0.20"));
        });
    });
});
