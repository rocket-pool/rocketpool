import assert from "assert";
import { parseEther } from "ethers";

import {
    before,
    describe,
    expectRevert,
    it,
    load,
    type ProtocolCurrent,
} from "../../harness";
import {
    burnStakedRplAndAssert,
    lockRplAndAssert,
    transferStakedRplAndAssert,
    unlockRplAndAssert,
} from "../../scenarios/node/rpl-stake-controller";
import {
    rplStakingSnapshot,
    stakeRplAndAssert,
    unstakeLegacyRplAndAssert,
    unstakeRplAndAssert,
    withdrawRplAndAssert,
} from "../../scenarios/node/rpl-staking";

const rpl = parseEther;

async function assertStake(
    protocol: ProtocolCurrent,
    node: string,
    legacy: bigint,
    megapool: bigint,
): Promise<void> {
    const snapshot = await rplStakingSnapshot(protocol, node);
    assert.equal(snapshot.nodeLegacy, legacy);
    assert.equal(snapshot.nodeMega, megapool);
    assert.equal(snapshot.nodeTotal, legacy + megapool);
}

describe("RocketNodeStaking", () => {
    describe("current staking", () => {
        before(async () => {
            const current = await load().ensure("current");
            await current.nodes.register("node");
            await current.nodes.register("node2");
            for (const actor of [
                "node",
                "node2",
                "random",
                "rplWithdrawalAddress",
                "withdrawalAddress",
            ]) {
                await current.tokens.mintRpl(actor, rpl("10000"));
            }
        });

        it("lets a node operator stake RPL more than once", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("5000"));
            await stakeRplAndAssert(current, "node", rpl("5000"));
            await assertStake(current, "node", 0n, rpl("10000"));
        });

        it("prevents an unregistered address from staking RPL", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.nodes.stakeRpl("random", rpl("10000")),
                "Invalid node",
            );
        });

        it("prevents directly withdrawing staked RPL", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("10000"));
            await expectRevert(
                () => current.nodes.withdrawRpl("node"),
                "No available unstaking RPL to withdraw",
            );
            await assertStake(current, "node", 0n, rpl("10000"));
        });

        it("prevents unstaking megapool RPL through the legacy path", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("100"));
            await expectRevert(
                () => current.nodes.unstakeLegacyRpl("node", rpl("100")),
                "Insufficient legacy staked RPL",
            );
            await assertStake(current, "node", 0n, rpl("100"));
        });

        it("prevents unstaking more RPL than the node has staked", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("10"));
            await expectRevert(
                () => current.nodes.unstakeRpl("node", rpl("10000")),
                "Insufficient RPL stake to reduce",
            );
            await assertStake(current, "node", 0n, rpl("10"));
        });

        it("lets a node operator unstake RPL", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("10000"));
            await unstakeRplAndAssert(current, "node", rpl("10000"));
            await assertStake(current, "node", 0n, 0n);
        });

        it("withdraws matured RPL automatically during a later unstake", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("5000"));
            await unstakeRplAndAssert(current, "node", rpl("1000"));
            await assertStake(current, "node", 0n, rpl("4000"));
            assert.equal(await current.nodes.unstakingRpl("node"), rpl("1000"));

            await current.time.advanceRplUnstakingPeriod();
            await unstakeRplAndAssert(current, "node", rpl("1000"));
            await assertStake(current, "node", 0n, rpl("3000"));
            assert.equal(await current.nodes.unstakingRpl("node"), rpl("1000"));
        });

        it("honours the withdrawal cooldown after the unstaking period", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.nodes.setWithdrawalCooldown(5n * 24n * 60n * 60n);
            await stakeRplAndAssert(current, "node", rpl("1000"));
            await unstakeRplAndAssert(current, "node", rpl("1000"));
            await current.time.advanceRplUnstakingPeriod();
            await stakeRplAndAssert(current, "node", rpl("1"));

            await expectRevert(
                () => current.nodes.withdrawRpl("node"),
                "No available unstaking RPL to withdraw",
            );
            await current.time.advanceRplWithdrawalCooldown();
            await withdrawRplAndAssert(current, "node");
        });

        it("lets the RPL withdrawal address unstake for the node", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("10000"));
            await current.nodes.setRplWithdrawalAddress("node", "rplWithdrawalAddress");
            await unstakeRplAndAssert(current, "node", rpl("10000"), {
                caller: "rplWithdrawalAddress",
            });
            await assertStake(current, "node", 0n, 0n);
        });

        it("prevents a random address from unstaking for the node", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("10000"));
            await current.nodes.setRplWithdrawalAddress("node", "rplWithdrawalAddress");
            const before = await rplStakingSnapshot(current, "node");

            await expectRevert(
                () => current.nodes.unstakeRpl("node", rpl("10000"), { caller: "random" }),
                "Not allowed to unstake for",
            );
            assert.deepEqual(await rplStakingSnapshot(current, "node"), before);
        });

        it("lets a node withdraw unstaked RPL after the unstaking period", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("10000"));
            await unstakeRplAndAssert(current, "node", rpl("500"));
            await expectRevert(
                () => current.nodes.withdrawRpl("node"),
                "No available unstaking RPL to withdraw",
            );
            await current.time.advanceRplUnstakingPeriod();
            await withdrawRplAndAssert(current, "node");
            await assertStake(current, "node", 0n, rpl("9500"));
        });

        it("lets the RPL withdrawal address withdraw after the unstaking period", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("10000"));
            await unstakeRplAndAssert(current, "node", rpl("500"));
            await current.nodes.setRplWithdrawalAddress("node", "rplWithdrawalAddress");
            await expectRevert(
                () => current.nodes.withdrawRpl("node", { caller: "rplWithdrawalAddress" }),
                "No available unstaking RPL to withdraw",
            );
            await current.time.advanceRplUnstakingPeriod();
            await withdrawRplAndAssert(current, "node", { caller: "rplWithdrawalAddress" });
            await assertStake(current, "node", 0n, rpl("9500"));
        });

        it("prevents staking for a node without permission", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.nodes.stakeRplFor("node", rpl("10000"), { caller: "random" }),
                "Not allowed to stake for",
            );
        });

        it("lets an approved address stake for a node", async () => {
            const current = await load().ensure("current");
            await current.nodes.setStakeRplForAllowed("node", "random", true);
            await stakeRplAndAssert(current, "node", rpl("10000"), { caller: "random" });
            await assertStake(current, "node", 0n, rpl("10000"));
        });

        it("lets the RPL withdrawal address approve staking for the node", async () => {
            const current = await load().ensure("current");
            await current.nodes.setRplWithdrawalAddress("node", "rplWithdrawalAddress");
            await expectRevert(
                () => current.nodes.setStakeRplForAllowed("node", "random", true),
                "Must be called from RPL withdrawal address",
            );
            await current.nodes.setStakeRplForAllowed("node", "random", true, {
                caller: "rplWithdrawalAddress",
            });
            await stakeRplAndAssert(current, "node", rpl("10000"), { caller: "random" });
            await assertStake(current, "node", 0n, rpl("10000"));
        });

        it("prevents the node address staking after an RPL withdrawal address is set", async () => {
            const current = await load().ensure("current");
            await current.nodes.setRplWithdrawalAddress("node", "rplWithdrawalAddress");
            await expectRevert(
                () => current.nodes.stakeRpl("node", rpl("10000")),
                "Not allowed to stake for",
            );
        });

        it("lets the primary withdrawal address stake for the node", async () => {
            const current = await load().ensure("current");
            await current.nodes.setWithdrawalAddress("node", "withdrawalAddress", { confirm: true });
            await stakeRplAndAssert(current, "node", rpl("10000"), { caller: "withdrawalAddress" });
            await assertStake(current, "node", 0n, rpl("10000"));
        });

        it("lets the RPL withdrawal address stake for the node", async () => {
            const current = await load().ensure("current");
            await current.nodes.setRplWithdrawalAddress("node", "rplWithdrawalAddress");
            await stakeRplAndAssert(current, "node", rpl("10000"), { caller: "rplWithdrawalAddress" });
            await assertStake(current, "node", 0n, rpl("10000"));
        });

        describe("with a registered RPL stake controller", () => {
            before(async () => {
                const ctx = load();
                await ctx.ensure("current");
                await ctx.fixtures.rplStakeController.deploy("stakeController");
            });

            it("prevents unstaking RPL that is locked", async () => {
                const ctx = load();
                const current = await ctx.ensure("current");
                const controller = ctx.fixtures.rplStakeController.get("stakeController");
                await stakeRplAndAssert(current, "node", rpl("100"));
                await current.nodes.setRplLockingAllowed("node", true);
                await lockRplAndAssert(current, controller, "node", rpl("50"));
                await expectRevert(
                    () => current.nodes.unstakeRpl("node", rpl("100")),
                    "Insufficient RPL stake to reduce",
                );
                await unstakeRplAndAssert(current, "node", rpl("50"));
                await unlockRplAndAssert(current, controller, "node", rpl("50"));
                await unstakeRplAndAssert(current, "node", rpl("50"));
                await assertStake(current, "node", 0n, 0n);
            });

            it("transfers staked RPL between nodes", async () => {
                const ctx = load();
                const current = await ctx.ensure("current");
                const controller = ctx.fixtures.rplStakeController.get("stakeController");
                await stakeRplAndAssert(current, "node", rpl("100"));
                await stakeRplAndAssert(current, "node2", rpl("100"));
                await transferStakedRplAndAssert(current, controller, "node", "node2", rpl("50"));
                await expectRevert(
                    () => current.nodes.unstakeRpl("node", rpl("100")),
                    "Insufficient RPL stake to reduce",
                );
                await unstakeRplAndAssert(current, "node", rpl("50"));
                await unstakeRplAndAssert(current, "node2", rpl("150"));
                await assertStake(current, "node", 0n, 0n);
                await assertStake(current, "node2", 0n, 0n);
            });

            it("does not let a controller lock RPL that is already unstaking", async () => {
                const ctx = load();
                const current = await ctx.ensure("current");
                const controller = ctx.fixtures.rplStakeController.get("stakeController");
                await stakeRplAndAssert(current, "node", rpl("100"));
                await unstakeRplAndAssert(current, "node", rpl("50"));
                await current.nodes.setRplLockingAllowed("node", true);
                await expectRevert(
                    () => controller.lock("node", rpl("100")),
                    "Not enough staked RPL",
                );
                await lockRplAndAssert(current, controller, "node", rpl("50"));
                await assertStake(current, "node", 0n, rpl("50"));
            });

            it("burns staked RPL", async () => {
                const ctx = load();
                const current = await ctx.ensure("current");
                const controller = ctx.fixtures.rplStakeController.get("stakeController");
                await stakeRplAndAssert(current, "node", rpl("100"));
                await burnStakedRplAndAssert(current, controller, "node", rpl("50"));
                await expectRevert(
                    () => current.nodes.unstakeRpl("node", rpl("100")),
                    "Insufficient RPL stake to reduce",
                );
                await unstakeRplAndAssert(current, "node", rpl("50"));
                await assertStake(current, "node", 0n, 0n);
            });
        });
    });

    describe("RPL staked before the 1.4 upgrade", () => {
        before(async () => {
            const rp131 = await load().ensure("1.3.1");
            await rp131.nodes.register("node");
            await rp131.nodes.register("node2");
            await rp131.tokens.mintRpl("node", rpl("1000"));
            await rp131.nodes.stakeRpl("node", rpl("1000"));

            const current = await rp131.upgradeTo("current");
            for (const actor of [
                "node",
                "node2",
                "random",
                "rplWithdrawalAddress",
                "withdrawalAddress",
            ]) {
                await current.tokens.mintRpl(actor, rpl("10000"));
            }
            await assertStake(current, "node", rpl("1000"), 0n);
        });

        it("unstakes and withdraws legacy RPL", async () => {
            const current = await load().ensure("current");
            await unstakeLegacyRplAndAssert(current, "node", rpl("500"));
            await current.time.advanceRplUnstakingPeriod();
            await withdrawRplAndAssert(current, "node");
            await assertStake(current, "node", rpl("500"), 0n);
        });

        it("lets the RPL withdrawal address unstake and withdraw legacy RPL", async () => {
            const current = await load().ensure("current");
            await current.nodes.setRplWithdrawalAddress("node", "rplWithdrawalAddress");
            await unstakeLegacyRplAndAssert(current, "node", rpl("1000"), {
                caller: "rplWithdrawalAddress",
            });
            await current.time.advanceRplUnstakingPeriod();
            await withdrawRplAndAssert(current, "node", { caller: "rplWithdrawalAddress" });
            await assertStake(current, "node", 0n, 0n);
        });

        it("prevents a random address unstaking legacy RPL for the node", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.nodes.unstakeLegacyRpl("node", rpl("1000"), { caller: "random" }),
                "Not allowed to unstake legacy RPL for",
            );
            await assertStake(current, "node", rpl("1000"), 0n);
        });

        it("prevents unstaking legacy RPL through the megapool path", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.nodes.unstakeRpl("node", rpl("1")),
                "Insufficient RPL stake to reduce",
            );
            await assertStake(current, "node", rpl("1000"), 0n);
        });

        it("prevents withdrawing legacy RPL before it has been unstaked", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.nodes.withdrawRpl("node"),
                "No available unstaking RPL to withdraw",
            );
            await assertStake(current, "node", rpl("1000"), 0n);
        });

        it("independently unstakes legacy and megapool RPL", async () => {
            const current = await load().ensure("current");
            await stakeRplAndAssert(current, "node", rpl("1000"));
            await unstakeRplAndAssert(current, "node", rpl("500"));
            await unstakeLegacyRplAndAssert(current, "node", rpl("500"));
            await current.time.advanceRplUnstakingPeriod();
            await withdrawRplAndAssert(current, "node");
            await assertStake(current, "node", rpl("500"), rpl("500"));
        });

        describe("with a registered RPL stake controller", () => {
            before(async () => {
                const ctx = load();
                await ctx.ensure("current");
                await ctx.fixtures.rplStakeController.deploy("legacyStakeController");
            });

            it("unstakes the unlocked legacy portion of a mixed stake", async () => {
                const ctx = load();
                const current = await ctx.ensure("current");
                const controller = ctx.fixtures.rplStakeController.get("legacyStakeController");
                await stakeRplAndAssert(current, "node", rpl("1000"));
                await current.nodes.setRplLockingAllowed("node", true);
                await lockRplAndAssert(current, controller, "node", rpl("1500"));
                await expectRevert(
                    () => current.nodes.unstakeLegacyRpl("node", rpl("1000")),
                    "Insufficient RPL stake to reduce",
                );
                await unstakeLegacyRplAndAssert(current, "node", rpl("500"));
                await expectRevert(
                    () => current.nodes.unstakeRpl("node", rpl("500")),
                    "Insufficient RPL stake to reduce",
                );
                await unlockRplAndAssert(current, controller, "node", rpl("1500"));
                await unstakeRplAndAssert(current, "node", rpl("500"));
                await assertStake(current, "node", rpl("500"), rpl("500"));
            });

            it("unstakes the unlocked megapool portion of a mixed stake", async () => {
                const ctx = load();
                const current = await ctx.ensure("current");
                const controller = ctx.fixtures.rplStakeController.get("legacyStakeController");
                await stakeRplAndAssert(current, "node", rpl("1000"));
                await current.nodes.setRplLockingAllowed("node", true);
                await lockRplAndAssert(current, controller, "node", rpl("1500"));
                await expectRevert(
                    () => current.nodes.unstakeRpl("node", rpl("1000")),
                    "Insufficient RPL stake to reduce",
                );
                await unstakeRplAndAssert(current, "node", rpl("500"));
                await expectRevert(
                    () => current.nodes.unstakeLegacyRpl("node", rpl("500")),
                    "Insufficient RPL stake to reduce",
                );
                await unlockRplAndAssert(current, controller, "node", rpl("1500"));
                await unstakeLegacyRplAndAssert(current, "node", rpl("500"));
                await assertStake(current, "node", rpl("500"), rpl("500"));
            });

            it("converts transferred legacy stake into megapool stake", async () => {
                const ctx = load();
                const current = await ctx.ensure("current");
                const controller = ctx.fixtures.rplStakeController.get("legacyStakeController");
                await stakeRplAndAssert(current, "node", rpl("1000"));
                await transferStakedRplAndAssert(
                    current,
                    controller,
                    "node",
                    "node2",
                    rpl("1500"),
                );
                await assertStake(current, "node", 0n, rpl("500"));
                await assertStake(current, "node2", 0n, rpl("1500"));
            });
        });
    });
});
