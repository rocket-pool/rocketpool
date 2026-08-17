import assert from "assert";
import { parseEther, ZeroAddress } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import {
    RocketDAONodeTrustedUpgrade__factory,
    RocketMinipoolManager__factory,
} from "../../harness/bindings/current";
import {
    before,
    describe,
    expectRevert,
    it,
    load,
    type ProtocolCurrent,
} from "../../harness";
import {
    challengeODAOMemberAndAssert,
    decideODAOChallengeAndAssert,
} from "../../scenarios/odao/challenge-member";
import {
    bootstrapRegistryChangeAndAssert,
    compressAbi,
    deployMinipoolManagerUpgradeTarget,
    deployODAOUpgradeTarget,
    executeContractUpgradeProposalAndAssert,
    voteContractUpgradeAndAssert,
} from "../../scenarios/odao/contract-upgrade";
import { kickODAOMemberAndAssert } from "../../scenarios/odao/kick-member";
import { leaveODAOMemberAndAssert } from "../../scenarios/odao/leave-member";
import {
    bootstrapODAOInviteAndAssert,
    disableODAOBootstrapAndAssert,
    joinODAOMemberAndAssert,
    joinRequiredODAOMemberAndAssert,
} from "../../scenarios/odao/membership";
import {
    advancePastODAOProposalEnd,
    advancePastODAOProposalExpiry,
    advanceToODAOProposalStart,
    cancelODAOAndAssert,
    executeODAOAndAssert,
    ODAO_PROPOSAL,
    proposeODAOAndAssert,
    voteODAOAndAssert,
} from "../../scenarios/odao/proposal";

const ONE_DAY = 24n * 60n * 60n;
const CHALLENGE_TIME = 60n * 60n;
const MEMBER_URL = "node@home.com";

async function addThirdMember(protocol: ProtocolCurrent, member = "trusted3"): Promise<void> {
    await protocol.odao.members.bootstrap(member, {
        id: `${member}-id`,
        url: MEMBER_URL,
    });
}

async function invitePayload(
    protocol: ProtocolCurrent,
    member: string,
    id = `${member}-id`,
): Promise<string> {
    return protocol.contracts.rocketDAONodeTrustedProposals.interface.encodeFunctionData(
        "proposalInvite",
        [id, MEMBER_URL, await protocol.nodes.address(member)],
    );
}

async function leavePayload(protocol: ProtocolCurrent, member: string): Promise<string> {
    return protocol.contracts.rocketDAONodeTrustedProposals.interface.encodeFunctionData(
        "proposalLeave",
        [await protocol.nodes.address(member)],
    );
}

async function inviteThroughProposal(
    protocol: ProtocolCurrent,
    member: string,
    options: { proposer?: string; voters?: readonly string[] } = {},
): Promise<bigint> {
    const proposer = options.proposer ?? "trusted1";
    const voters = options.voters ?? ["trusted1", "trusted2"];
    const proposalId = await proposeODAOAndAssert(
        protocol,
        `Invite ${member}`,
        await invitePayload(protocol, member),
        { caller: proposer },
    );
    await advanceToODAOProposalStart(protocol, proposalId);
    for (const voter of voters) {
        await voteODAOAndAssert(protocol, proposalId, true, { caller: voter });
    }
    await executeODAOAndAssert(protocol, proposalId, { caller: voters[0] });
    return proposalId;
}

describe("RocketDAONodeTrusted", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        const current = await rp131.upgradeTo("current");
        for (const node of ["node1", "node2", "node3", "trusted1", "trusted2", "trusted3"]) {
            await current.nodes.register(node);
        }
        await current.odao.members.bootstrap("trusted1", { id: "rocketpool-1", url: MEMBER_URL });
        await current.odao.members.bootstrap("trusted2", { id: "rocketpool-2", url: MEMBER_URL });
        await current.odao.settings.proposals.setCooldown(10n);
        await current.odao.settings.proposals.setVoteDelay(4n);
        await current.pdao.settings.security.setUpgradeDelay(ONE_DAY);
    });

    describe("bootstrap membership and settings", () => {
        it("rejects bootstrapping a non-registered node", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.members.bootstrapInvite("user", {
                    id: "rocketpool",
                    url: MEMBER_URL,
                }),
                "Invalid node",
            );
        });

        it("rejects a bootstrap invitation from a non-guardian", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.members.bootstrapInvite("node1", {
                    id: "rocketpool",
                    url: MEMBER_URL,
                    caller: "user",
                }),
                "Account is not a temporary guardian",
            );
        });

        it("rejects bootstrapping the same member twice", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.members.bootstrapInvite("trusted2", {
                    id: "rocketpool",
                    url: MEMBER_URL,
                }),
                "This node is already part of the trusted node DAO",
            );
        });

        it("updates the quorum while bootstrap mode is enabled", async () => {
            const current = await load().ensure("current");
            await current.odao.settings.members.setQuorum(parseEther("0.55"));
            assert.equal(await current.odao.settings.members.quorum(), parseEther("0.55"));
        });

        it("updates the RPL bond while bootstrap mode is enabled", async () => {
            const current = await load().ensure("current");
            await current.odao.settings.members.setBond(parseEther("10000"));
            assert.equal(await current.odao.settings.members.bond(), parseEther("10000"));
        });

        it("rejects an RPL bond update from a non-guardian", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.settings.members.setBond(parseEther("10000"), {
                    caller: "user",
                }),
                "Account is not a temporary guardian",
            );
        });

        it("rejects a setting update after bootstrap mode is disabled", async () => {
            const current = await load().ensure("current");
            await disableODAOBootstrapAndAssert(current);
            await expectRevert(
                () => current.odao.settings.proposals.setCooldown(60n),
                "Bootstrap mode not engaged",
            );
        });

        it("rejects a zero quorum", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.settings.members.setQuorum(0n),
                "Quorum setting must be > 0 & <= 90%",
            );
        });

        it("rejects a quorum above 90%", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.settings.members.setQuorum(parseEther("0.91")),
                "Quorum setting must be > 0 & <= 90%",
            );
        });

        it("calculates the required quorum votes from member count and threshold", async () => {
            const current = await load().ensure("current");
            assert.equal(
                await current.odao.members.quorumVotesRequired(),
                await current.odao.settings.members.quorum() * await current.odao.members.count(),
            );
        });
    });

    describe("membership proposals", () => {
        it("invites two members through proposals and lets an approved member leave", async () => {
            const current = await load().ensure("current");
            await disableODAOBootstrapAndAssert(current);
            await joinRequiredODAOMemberAndAssert(current, "trusted3", {
                id: "emergency-member",
                url: MEMBER_URL,
            });
            await inviteThroughProposal(current, "node1", { proposer: "trusted1" });
            await inviteThroughProposal(current, "node2", { proposer: "trusted2" });
            await joinODAOMemberAndAssert(current, "node1");
            await joinODAOMemberAndAssert(current, "node2");
            await leaveODAOMemberAndAssert(current, {
                member: "trusted2",
                voters: ["trusted1", "node1", "node2"],
            });
            assert.equal(await current.odao.members.isValid("trusted2"), false);
        });

        it("moves a passing proposal through pending, succeeded, and executed states", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current, "node1");
            const id = await proposeODAOAndAssert(
                current,
                "Invite node2",
                await invitePayload(current, "node2"),
                { caller: "trusted1" },
            );
            await expectRevert(
                () => current.odao.proposals.vote(id, true, { caller: "node1" }),
                "Voting is not active for this proposal",
            );
            await advanceToODAOProposalStart(current, id);
            await voteODAOAndAssert(current, id, true, { caller: "node1" });
            await voteODAOAndAssert(current, id, true, { caller: "trusted2" });
            await expectRevert(
                () => current.odao.proposals.vote(id, false, { caller: "trusted1" }),
                "Proposal has passed, voting is complete",
            );
            await executeODAOAndAssert(current, id, { caller: "node1" });
        });

        it("moves a rejected proposal to defeated and prevents execution", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current, "node1");
            const id = await proposeODAOAndAssert(
                current,
                "Invite node2",
                await invitePayload(current, "node2"),
                { caller: "trusted1" },
            );
            await advanceToODAOProposalStart(current, id);
            await voteODAOAndAssert(current, id, true, { caller: "node1" });
            await voteODAOAndAssert(current, id, false, { caller: "trusted2" });
            await voteODAOAndAssert(current, id, false, { caller: "trusted1" });
            await advancePastODAOProposalEnd(current, id);
            assert.equal((await current.odao.proposals.details(id)).state, ODAO_PROPOSAL.defeated);
            await expectRevert(
                () => current.odao.proposals.execute(id, { caller: "node1" }),
                "Proposal has not succeeded, has expired or has already been executed",
            );
        });

        it("lets the proposer cancel an active proposal", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current);
            const id = await proposeODAOAndAssert(
                current,
                "Invite node1",
                await invitePayload(current, "node1"),
                { caller: "trusted1" },
            );
            await advanceToODAOProposalStart(current, id);
            await voteODAOAndAssert(current, id, true, { caller: "trusted1" });
            await cancelODAOAndAssert(current, id, { caller: "trusted1" });
        });

        it("enforces the per-member proposal cooldown", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current);
            await current.odao.settings.proposals.setCooldown(60n * 60n);
            await proposeODAOAndAssert(
                current,
                "Invite node1",
                await invitePayload(current, "node1"),
                { caller: "trusted1" },
            );
            const secondPayload = await invitePayload(current, "node2");
            await expectRevert(
                () => proposeODAOAndAssert(
                    current,
                    "Invite node2",
                    secondPayload,
                    { caller: "trusted1", respectCooldown: false },
                ),
                "Member has not waited long enough to make another proposal",
            );
            await current.time.advance(60n * 60n + 1n);
            await proposeODAOAndAssert(
                current,
                "Invite node2",
                await invitePayload(current, "node2"),
                { caller: "trusted1", respectCooldown: false },
            );
        });

        it("prevents a member added after proposal creation from voting", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current);
            const id = await proposeODAOAndAssert(
                current,
                "Invite node1",
                await invitePayload(current, "node1"),
                { caller: "trusted1" },
            );
            await current.odao.members.bootstrap("node2", { id: "late-member", url: MEMBER_URL });
            await advanceToODAOProposalStart(current, id);
            await voteODAOAndAssert(current, id, true, { caller: "trusted1" });
            await expectRevert(
                () => current.odao.proposals.vote(id, true, { caller: "node2" }),
                "Member cannot vote on proposal created before they became a member",
            );
        });

        it("rejects a leave proposal that would reduce membership below the minimum", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current);
            const id = await proposeODAOAndAssert(
                current,
                "Let trusted1 leave",
                await leavePayload(current, "trusted1"),
                { caller: "trusted1" },
            );
            await advanceToODAOProposalStart(current, id);
            await voteODAOAndAssert(current, id, true, { caller: "trusted1" });
            await voteODAOAndAssert(current, id, true, { caller: "trusted2" });
            await advancePastODAOProposalEnd(current, id);
            await expectRevert(
                () => current.odao.proposals.execute(id, { caller: "node2" }),
                "Member count will fall below min required",
            );
        });

        it("kicks a member with a one-third fine and burns the fine", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current);
            await current.odao.members.bootstrap("node1", { id: "node1-id", url: MEMBER_URL });
            const fine = await current.odao.members.bond("trusted2") / 3n;
            await kickODAOMemberAndAssert(current, {
                member: "trusted2",
                proposer: "trusted1",
                voters: ["node1", "trusted1", "trusted3"],
                fine,
            });
        });

        it("also prevents a second late-joining member from voting on an existing proposal", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current);
            const id = await proposeODAOAndAssert(
                current,
                "Let trusted1 leave",
                await leavePayload(current, "trusted1"),
                { caller: "trusted1" },
            );
            await current.odao.members.bootstrap("node2", { id: "late-member", url: MEMBER_URL });
            await advanceToODAOProposalStart(current, id);
            await voteODAOAndAssert(current, id, true, { caller: "trusted1" });
            await expectRevert(
                () => current.odao.proposals.vote(id, true, { caller: "node2" }),
                "Member cannot vote on proposal created before they became a member",
            );
        });

        it("rejects execution after a successful proposal expires", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current);
            const id = await proposeODAOAndAssert(
                current,
                "Let trusted1 leave",
                await leavePayload(current, "trusted1"),
                { caller: "trusted1" },
            );
            await advanceToODAOProposalStart(current, id);
            await voteODAOAndAssert(current, id, true, { caller: "trusted1" });
            await voteODAOAndAssert(current, id, true, { caller: "trusted2" });
            await advancePastODAOProposalExpiry(current, id);
            assert.equal((await current.odao.proposals.details(id)).state, ODAO_PROPOSAL.expired);
            await expectRevert(
                () => current.odao.proposals.execute(id, { caller: "node2" }),
                "Proposal has not succeeded, has expired or has already been executed",
            );
        });

        it("rejects both execution and cancellation after expiry", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current);
            const id = await proposeODAOAndAssert(
                current,
                "Let trusted1 leave",
                await leavePayload(current, "trusted1"),
                { caller: "trusted1" },
            );
            await advanceToODAOProposalStart(current, id);
            await voteODAOAndAssert(current, id, true, { caller: "trusted1" });
            await voteODAOAndAssert(current, id, true, { caller: "trusted2" });
            await advancePastODAOProposalExpiry(current, id);
            await expectRevert(
                () => current.odao.proposals.execute(id, { caller: "node2" }),
                "Proposal has not succeeded, has expired or has already been executed",
            );
            await expectRevert(
                () => current.odao.proposals.cancel(id, { caller: "trusted1" }),
                "Proposal can only be cancelled if pending or active",
            );
        });
    });

    describe("member challenges and emergency membership", () => {
        it("allows a challenged member to respond during and after the response window", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current, "node1");
            await current.odao.settings.members.setChallengeWindow(CHALLENGE_TIME);
            await current.odao.settings.members.setChallengeCooldown(CHALLENGE_TIME);
            await expectRevert(
                () => current.odao.challenges.make("node2", { caller: "trusted1" }),
                "Invalid trusted node",
            );
            await challengeODAOMemberAndAssert(current, "node1", { caller: "trusted1" });
            await expectRevert(
                () => current.odao.challenges.make("node1", { caller: "trusted1" }),
                "Member is already being challenged",
            );
            await expectRevert(
                () => current.odao.challenges.make("trusted2", { caller: "trusted1" }),
                "You must wait for the challenge cooldown",
            );
            await decideODAOChallengeAndAssert(current, "node1", true, { caller: "node1" });
            await current.time.advance(CHALLENGE_TIME + 1n);
            await challengeODAOMemberAndAssert(current, "node1", { caller: "trusted1" });
            await current.time.advance(CHALLENGE_TIME + 1n);
            await decideODAOChallengeAndAssert(current, "node1", true, { caller: "node1" });
        });

        it("removes a member and forfeits their bond when they do not respond", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current, "node1");
            await current.odao.settings.members.setChallengeWindow(CHALLENGE_TIME);
            await current.odao.settings.members.setChallengeCooldown(CHALLENGE_TIME);
            await expectRevert(
                () => current.odao.challenges.make("node1", { caller: "node1" }),
                "You cannot challenge yourself",
            );
            await challengeODAOMemberAndAssert(current, "node1", { caller: "trusted1" });
            await expectRevert(
                () => current.odao.challenges.decide("trusted2", { caller: "trusted1" }),
                "Member hasn't been challenged",
            );
            await expectRevert(
                () => current.odao.challenges.decide("node1", { caller: "trusted2" }),
                "Refute window has not yet passed",
            );
            await current.time.advance(CHALLENGE_TIME + 1n);
            await decideODAOChallengeAndAssert(current, "node1", false, { caller: "trusted2" });
        });

        it("requires a registered non-member to pay the challenge fee", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current, "node1");
            await current.odao.settings.members.setChallengeWindow(CHALLENGE_TIME);
            await current.odao.settings.members.setChallengeCooldown(CHALLENGE_TIME);
            await expectRevert(
                () => current.odao.challenges.make("user", { caller: "node2" }),
                "Invalid trusted node",
            );
            await expectRevert(
                () => current.odao.challenges.make("trusted2", { caller: "user" }),
                "Invalid node",
            );
            await expectRevert(
                () => current.odao.challenges.make("node1", { caller: "node2" }),
                "Non DAO members must pay ETH",
            );
            await challengeODAOMemberAndAssert(current, "node1", {
                caller: "node2",
                value: await current.odao.settings.members.challengeCost(),
            });
            await current.time.advance(CHALLENGE_TIME + 1n);
            await decideODAOChallengeAndAssert(current, "node1", false, { caller: "trusted2" });
        });

        it("allows a bonded registered node to restore the minimum member count", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.members.joinRequired("user", {
                    id: "emergency",
                    url: MEMBER_URL,
                }),
                "Invalid node",
            );
            await expectRevert(
                () => current.odao.members.joinRequired("node2", {
                    id: "emergency",
                    url: MEMBER_URL,
                }),
                "Not enough allowance",
            );
            await joinRequiredODAOMemberAndAssert(current, "node2", {
                id: "emergency",
                url: MEMBER_URL,
            });
        });

        it("rejects emergency membership when the DAO has its minimum member count", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current, "node1");
            await current.odao.members.prepareBond("node2");
            await expectRevert(
                () => current.odao.members.joinRequired("node2", {
                    id: "emergency",
                    url: MEMBER_URL,
                }),
                "Low member mode not engaged",
            );
        });
    });

    describe("bootstrap contract registry changes", () => {
        it("upgrades a contract in bootstrap mode", async () => {
            const current = await load().ensure("current");
            await bootstrapRegistryChangeAndAssert(current, {
                type: "upgradeContract",
                name: "rocketNodeManager",
                abi: RocketMinipoolManager__factory.abi,
                address: await deployMinipoolManagerUpgradeTarget(current),
            });
        });

        it("upgrades the oDAO upgrade contract itself", async () => {
            const current = await load().ensure("current");
            await bootstrapRegistryChangeAndAssert(current, {
                type: "upgradeContract",
                name: "rocketDAONodeTrustedUpgrade",
                abi: RocketDAONodeTrustedUpgrade__factory.abi,
                address: await deployODAOUpgradeTarget(current),
            });
        });

        it("rejects a bootstrap contract upgrade from a non-guardian", async () => {
            const current = await load().ensure("current");
            const target = await deployMinipoolManagerUpgradeTarget(current);
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "upgradeContract",
                    "rocketNodeManager",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    target,
                    { caller: "user" },
                ),
                "Account is not a temporary guardian",
            );
        });

        it("rejects a contract upgrade to the zero address", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "upgradeContract",
                    "rocketNodeManager",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    ZeroAddress,
                ),
                "Invalid contract address",
            );
        });

        it("rejects a contract upgrade to an address already in use", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "upgradeContract",
                    "rocketNodeManager",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    current.context.deployment.rocketStorageAddress,
                ),
                "Contract address is already in use",
            );
        });

        it("rejects a contract upgrade with an empty ABI", async () => {
            const current = await load().ensure("current");
            const target = await deployODAOUpgradeTarget(current);
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "upgradeContract",
                    "rocketDAONodeTrustedUpgrade",
                    "",
                    target,
                ),
                "Empty ABI is invalid",
            );
        });

        it("rejects upgrades of protected contracts", async () => {
            const current = await load().ensure("current");
            const target = await deployMinipoolManagerUpgradeTarget(current);
            for (const [name, reason] of [
                ["rocketVault", "Cannot upgrade the vault"],
                ["rocketTokenRETH", "Cannot upgrade token contracts"],
                ["rocketTokenRPL", "Cannot upgrade token contracts"],
                ["rocketTokenRPLFixedSupply", "Cannot upgrade token contracts"],
                ["casperDeposit", "Cannot upgrade the casper deposit contract"],
            ] as const) {
                await expectRevert(
                    () => current.odao.bootstrap.upgrade(
                        "upgradeContract",
                        name,
                        compressAbi(RocketMinipoolManager__factory.abi),
                        target,
                    ),
                    reason,
                );
            }
        });

        it("adds a new contract in bootstrap mode", async () => {
            const current = await load().ensure("current");
            await bootstrapRegistryChangeAndAssert(current, {
                type: "addContract",
                name: "rocketMinipoolManagerNew",
                abi: RocketMinipoolManager__factory.abi,
                address: await deployMinipoolManagerUpgradeTarget(current),
            });
        });

        it("rejects adding a contract under an existing name", async () => {
            const current = await load().ensure("current");
            const target = await deployMinipoolManagerUpgradeTarget(current);
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "addContract",
                    "rocketStorage",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    target,
                ),
                "Contract name is already in use",
            );
        });

        it("rejects adding a contract at an existing address", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "addContract",
                    "rocketNewContract",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    current.context.deployment.rocketStorageAddress,
                ),
                "Contract address is already in use",
            );
        });

        it("rejects adding a contract with an empty name", async () => {
            const current = await load().ensure("current");
            const target = await deployMinipoolManagerUpgradeTarget(current);
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "addContract",
                    "",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    target,
                ),
                "Invalid contract name",
            );
        });

        it("rejects adding a contract with an empty ABI", async () => {
            const current = await load().ensure("current");
            const target = await deployMinipoolManagerUpgradeTarget(current);
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "addContract",
                    "rocketNewContract",
                    "",
                    target,
                ),
                "Empty ABI is invalid",
            );
        });
    });

    describe("delayed upgrades and membership history", () => {
        it("queues and executes a delayed network contract upgrade", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current);
            const target = await deployMinipoolManagerUpgradeTarget(current);
            const payload = current.contracts.rocketDAONodeTrustedProposals.interface.encodeFunctionData(
                "proposalUpgrade",
                [
                    "upgradeContract",
                    "rocketNodeManager",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    target,
                ],
            );
            const proposalId = await proposeODAOAndAssert(
                current,
                "Upgrade the node manager",
                payload,
                { caller: "trusted1" },
            );
            await advanceToODAOProposalStart(current, proposalId);
            await voteContractUpgradeAndAssert(current, proposalId, { caller: "trusted1" });
            await voteContractUpgradeAndAssert(current, proposalId, { caller: "trusted2" });
            const upgradeId = await executeContractUpgradeProposalAndAssert(
                current,
                proposalId,
                { caller: "node1" },
            );
            const details = await current.odao.upgrades.details(upgradeId);
            assert.equal(details.type, ethers.solidityPackedKeccak256(["string"], ["upgradeContract"]));
            assert.equal(details.name, "rocketNodeManager");
            assert.equal(details.address, target);
            await expectRevert(
                () => current.odao.upgrades.execute(upgradeId, { caller: "trusted1" }),
                "Proposal has not succeeded or has been vetoed or executed",
            );
            await current.time.advance(ONE_DAY + 1n);
            await expectRevert(
                () => current.odao.upgrades.execute(upgradeId, { caller: "user" }),
                "Invalid trusted node",
            );
            await current.odao.upgrades.execute(upgradeId, { caller: "trusted1" });
            const key = ethers.solidityPackedKeccak256(
                ["string", "string"],
                ["contract.address", "rocketNodeManager"],
            );
            assert.equal(
                await current.contracts.rocketStorage.getFunction("getAddress")(key),
                target,
            );
        });

        it("does not let a kicked member reuse an old invitation", async () => {
            const current = await load().ensure("current");
            await addThirdMember(current);
            await inviteThroughProposal(current, "node1");
            await joinODAOMemberAndAssert(current, "node1");
            await kickODAOMemberAndAssert(current, {
                member: "node1",
                voters: ["trusted1", "trusted2", "trusted3"],
            });
            const bond = await current.odao.settings.members.bond();
            const signer = await current.context.actor("node1");
            await (await current.contracts.rocketTokenRPL.connect(signer).approve(
                await current.contracts.rocketDAONodeTrustedActions.getAddress(),
                bond,
            )).wait();
            await expectRevert(
                () => current.odao.members.join("node1"),
                "This node has not been invited to join",
            );
        });
    });

    describe("bootstrap ABI registry changes and related setting guards", () => {
        it("upgrades an existing contract ABI", async () => {
            const current = await load().ensure("current");
            await bootstrapRegistryChangeAndAssert(current, {
                type: "upgradeABI",
                name: "rocketNodeManager",
                abi: RocketMinipoolManager__factory.abi,
                address: ZeroAddress,
            });
        });

        it("rejects upgrading an ABI to an identical value", async () => {
            const current = await load().ensure("current");
            await bootstrapRegistryChangeAndAssert(current, {
                type: "upgradeABI",
                name: "rocketNodeManager",
                abi: RocketMinipoolManager__factory.abi,
                address: ZeroAddress,
            });
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "upgradeABI",
                    "rocketNodeManager",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    ZeroAddress,
                ),
                "ABIs are identical",
            );
        });

        it("rejects upgrading an ABI that does not exist", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "upgradeABI",
                    "fooBarBaz",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    ZeroAddress,
                ),
                "ABI does not exist",
            );
        });

        it("rejects an ABI upgrade from a non-guardian", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "upgradeABI",
                    "rocketNodeManager",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    ZeroAddress,
                    { caller: "user" },
                ),
                "Account is not a temporary guardian",
            );
        });

        it("only accepts reduced bonds divisible by milliwei", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.nodes.setReducedBond(2_001_000_000_000_000_000n);
            await expectRevert(
                () => current.pdao.settings.nodes.setReducedBond(1_001_001_000_000_000_000n),
                "Value must be divisible by milliwei",
            );
        });

        it("rejects a zero megapool dissolve penalty", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.pdao.settings.megapools.setDissolvePenalty(0n),
                "Value must be >= 0.01 ETH",
            );
        });

        it("adds a new ABI in bootstrap mode", async () => {
            const current = await load().ensure("current");
            await bootstrapRegistryChangeAndAssert(current, {
                type: "addABI",
                name: "rocketNewFeature",
                abi: RocketMinipoolManager__factory.abi,
                address: ZeroAddress,
            });
        });

        it("rejects adding an ABI with an empty name", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "addABI",
                    "",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    ZeroAddress,
                ),
                "Invalid ABI name",
            );
        });

        it("rejects adding an empty ABI", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.bootstrap.upgrade("addABI", "rocketNewFeature", "", ZeroAddress),
                "Empty ABI is invalid",
            );
        });

        it("rejects adding an ABI under an existing name", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "addABI",
                    "rocketNodeManager",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    ZeroAddress,
                ),
                "ABI name is already in use",
            );
        });

        it("rejects adding an ABI from a non-guardian", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.bootstrap.upgrade(
                    "addABI",
                    "rocketNewFeature",
                    compressAbi(RocketMinipoolManager__factory.abi),
                    ZeroAddress,
                    { caller: "user" },
                ),
                "Account is not a temporary guardian",
            );
        });
    });
});
