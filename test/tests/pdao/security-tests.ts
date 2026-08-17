import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import {
    executeContractUpgradeProposalAndAssert,
    proposeContractUpgradeAndAssert,
    voteContractUpgradeAndAssert,
} from "../../scenarios/odao/contract-upgrade";
import {
    bootstrapSecurityMemberAndAssert,
    executeSecurityProposalAndAssert,
    executeUpgradeVetoAndAssert,
    leaveSecurityCouncilAndAssert,
    proposeSecuritySettingAndAssert,
    proposeUpgradeVetoAndAssert,
    voteSecurityProposalAndAssert,
    voteUpgradeVetoAndAssert,
} from "../../scenarios/pdao/security";

const ONE_DAY = 24n * 60n * 60n;

describe("RocketDAOSecurity", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.upgradeTo("current");
    });

    it("rejects joining without an invitation", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.pdao.security.members.join("random"),
            "This address has not been invited to join",
        );
    });

    it("accepts a guardian bootstrap invitation", async () => {
        const current = await load().ensure("current");
        await bootstrapSecurityMemberAndAssert(current, "securityMember1", {
            id: "Member 1",
        });
    });

    it("rejects leaving without an active leave request", async () => {
        const current = await load().ensure("current");
        await bootstrapSecurityMemberAndAssert(current, "securityMember1", {
            id: "Member 1",
        });
        await expectRevert(
            () => current.pdao.security.members.leave("securityMember1"),
            "This member has not been approved to leave or request has expired, please apply to leave again",
        );
    });

    it("allows a member to leave after the configured notice period", async () => {
        const current = await load().ensure("current");
        await bootstrapSecurityMemberAndAssert(current, "securityMember1", {
            id: "Member 1",
        });
        await current.pdao.security.members.requestLeave("securityMember1");
        await expectRevert(
            () => current.pdao.security.members.leave("securityMember1"),
            "Member has not waited required time to leave",
        );
        await current.time.advance(await current.pdao.settings.security.leaveTime() + 1n);
        await leaveSecurityCouncilAndAssert(current, "securityMember1");
    });

    describe("with an existing council", () => {
        before(async () => {
            const current = await load().ensure("current");
            for (const [member, id] of [
                ["securityMember1", "Member 1"],
                ["securityMember2", "Member 2"],
                ["securityMember3", "Member 3"],
            ] as const) {
                await bootstrapSecurityMemberAndAssert(current, member, { id });
            }
        });

        it("proposes and executes an allowed setting change", async () => {
            const current = await load().ensure("current");
            const proposalId = await proposeSecuritySettingAndAssert(current, {
                message: "Disable deposits urgently",
                caller: "securityMember1",
                namespace: "deposit",
                path: "deposit.enabled",
                value: false,
            });
            await voteSecurityProposalAndAssert(current, proposalId, true, {
                caller: "securityMember1",
            });
            await voteSecurityProposalAndAssert(current, proposalId, true, {
                caller: "securityMember2",
            });
            await executeSecurityProposalAndAssert(current, proposalId, {
                caller: "securityMember2",
            });
            assert.equal(await current.pdao.settings.deposits.enabled(), false);
        });

        it("rejects execution for a setting outside the security allowlist", async () => {
            const current = await load().ensure("current");
            const proposalId = await proposeSecuritySettingAndAssert(current, {
                message: "Increase the deposit pool maximum",
                caller: "securityMember1",
                namespace: "deposit",
                path: "deposit.pool.maximum",
                value: parseEther("10000"),
            });
            await voteSecurityProposalAndAssert(current, proposalId, true, {
                caller: "securityMember1",
            });
            await voteSecurityProposalAndAssert(current, proposalId, true, {
                caller: "securityMember2",
            });
            await expectRevert(
                () => current.pdao.security.proposals.execute(proposalId, {
                    caller: "securityMember2",
                }),
                "Setting is not modifiable by security council",
            );
        });

        it("rejects proposal execution without quorum", async () => {
            const current = await load().ensure("current");
            const proposalId = await proposeSecuritySettingAndAssert(current, {
                message: "Disable deposits urgently",
                caller: "securityMember1",
                namespace: "deposit",
                path: "deposit.enabled",
                value: false,
            });
            await voteSecurityProposalAndAssert(current, proposalId, true, {
                caller: "securityMember1",
            });
            await expectRevert(
                () => current.pdao.security.proposals.execute(proposalId, {
                    caller: "securityMember2",
                }),
                "Proposal has not succeeded, has expired or has already been executed",
            );
        });

        it("adjusts the node commission share security-council adder", async () => {
            const current = await load().ensure("current");
            const adder = parseEther("0.005");
            const proposalId = await proposeSecuritySettingAndAssert(current, {
                message: "Adjust the security council commission adder",
                caller: "securityMember1",
                namespace: "network",
                path: "network.node.commission.share.security.council.adder",
                value: adder,
            });
            await voteSecurityProposalAndAssert(current, proposalId, true, {
                caller: "securityMember1",
            });
            await voteSecurityProposalAndAssert(current, proposalId, true, {
                caller: "securityMember2",
            });
            await executeSecurityProposalAndAssert(current, proposalId, {
                caller: "securityMember2",
            });
            const expected = {
                node: parseEther("0.05") + adder,
                voter: parseEther("0.09") - adder,
            };
            assert.deepEqual(await current.pdao.settings.network.effectiveShares(), expected);
            assert.deepEqual(await current.network.revenues.shares(), expected);
        });

        it("vetoes a pending oDAO contract upgrade", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.security.setUpgradeDelay(ONE_DAY);
            for (const [member, id] of [
                ["trusted1", "rocketpool-1"],
                ["trusted2", "rocketpool-2"],
                ["trusted3", "rocketpool-3"],
            ] as const) {
                await current.nodes.register(member);
                await current.odao.members.bootstrap(member, {
                    id,
                    url: "http://rocketpool.net",
                });
            }
            const proposalId = await proposeContractUpgradeAndAssert(current, {
                proposer: "trusted1",
                contractName: "rocketNodeManager",
                message: "This is a totally safe upgrade",
            });
            await voteContractUpgradeAndAssert(current, proposalId, { caller: "trusted1" });
            await expectRevert(
                () => current.odao.proposals.execute(proposalId, { caller: "trusted1" }),
                "Proposal has not succeeded, has expired or has already been executed",
            );
            await voteContractUpgradeAndAssert(current, proposalId, { caller: "trusted2" });
            const upgradeId = await executeContractUpgradeProposalAndAssert(
                current,
                proposalId,
                { caller: "trusted1" },
            );
            const vetoId = await proposeUpgradeVetoAndAssert(current, upgradeId, {
                message: "Veto that malicious upgrade",
                caller: "securityMember1",
            });
            await voteUpgradeVetoAndAssert(current, vetoId, true, {
                caller: "securityMember1",
            });
            await executeUpgradeVetoAndAssert(current, vetoId, upgradeId, {
                caller: "securityMember2",
            });
            await current.time.advance(await current.pdao.settings.security.upgradeDelay() + 1n);
            await expectRevert(
                () => current.odao.upgrades.execute(upgradeId, { caller: "trusted1" }),
                "Proposal has not succeeded or has been vetoed or executed",
            );
        });
    });
});
