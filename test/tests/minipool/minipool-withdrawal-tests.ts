import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import { distributeMinipoolBalanceAndAssert } from "../../scenarios/minipool/distribute-balance";
import { finaliseMinipoolAndAssert } from "../../scenarios/minipool/finalise-minipool";
import { skimRewardsAndAssert } from "../../scenarios/minipool/skim-rewards";

const ONE_HOUR = 60n * 60n;
const ONE_DAY = 24n * ONE_HOUR;
const BOND = parseEther("16");
const NODE_FEE = parseEther("0.1");
const MAX_PENALTY_RATE = parseEther("0.5");
const USER_DISTRIBUTE_START = 90n * ONE_DAY;
const USER_DISTRIBUTE_LENGTH = ONE_HOUR;

describe("RocketMinipool withdrawals", () => {
    before(async () => {
        const ctx = load();
        const rp131 = await ctx.ensure("1.3.1");

        await rp131.pdao.settings.network.setNodeFeeRange({
            minimum: NODE_FEE,
            target: NODE_FEE,
            maximum: NODE_FEE,
        });
        await rp131.pdao.settings.minipools.setLaunchTimeout(72n * ONE_HOUR);
        await rp131.pdao.settings.minipools.setWithdrawalDelay(20n);
        await rp131.pdao.settings.minipools.setUserDistributeWindowStart(
            USER_DISTRIBUTE_START,
        );
        await rp131.pdao.settings.minipools.setUserDistributeWindowLength(
            USER_DISTRIBUTE_LENGTH,
        );
        await rp131.odao.settings.minipools.setScrubPeriod(ONE_DAY);
        await rp131.pdao.settings.network.setRethCollateralTarget(parseEther("50"));

        await rp131.nodes.register("node");
        await rp131.nodes.setWithdrawalAddress("node", "nodeWithdrawalAddress", {
            confirm: true,
        });
        await rp131.nodes.stakeMinimumRpl("node", { minipools: 7, bond: BOND });
        await rp131.depositPool.fund("depositor", BOND);
        await rp131.minipools.create("pool", { node: "node", bond: BOND });
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.minipools.stake("pool");

        const current = await rp131.upgradeTo("current");
        await current.minipools.setMaximumPenaltyRate(MAX_PENALTY_RATE);
        await ctx.fixtures.minipoolPenaltyController.deploy("penaltyController");
    });

    it("distributes a 36 ETH withdrawal when called by the node withdrawal address", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("36"),
            caller: "nodeWithdrawalAddress",
            expectedUser: parseEther("17.8"),
            expectedNode: parseEther("18.2"),
            expectedFinalised: true,
            expectedUserDistributed: false,
        });
    });

    it("distributes a 36 ETH withdrawal when called by the node account", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("36"),
            caller: "node",
            expectedUser: parseEther("17.8"),
            expectedNode: parseEther("18.2"),
            expectedFinalised: true,
            expectedUserDistributed: false,
        });
    });

    it("distributes a 36 ETH withdrawal through the user distribution window", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("36"),
            caller: "random",
            beginUserDistribution: true,
            expectedUser: parseEther("17.8"),
            expectedNode: parseEther("18.2"),
            expectedFinalised: false,
            expectedUserDistributed: true,
        });
    });

    it("distributes a 28 ETH withdrawal when called by the node withdrawal address", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("28"),
            caller: "nodeWithdrawalAddress",
            expectedUser: parseEther("16"),
            expectedNode: parseEther("12"),
            expectedFinalised: true,
            expectedUserDistributed: false,
        });
    });

    it("distributes a 28 ETH withdrawal through the user distribution window", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("28"),
            caller: "random",
            beginUserDistribution: true,
            expectedUser: parseEther("16"),
            expectedNode: parseEther("12"),
            expectedFinalised: false,
            expectedUserDistributed: true,
        });
    });

    it("finalises an unmarked 28 ETH withdrawal when called by the owner", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("28"),
            caller: "nodeWithdrawalAddress",
            expectedUser: parseEther("16"),
            expectedNode: parseEther("12"),
            expectedFinalised: true,
            expectedUserDistributed: false,
        });
    });

    it("marks an unmarked 28 ETH withdrawal as user distributed", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("28"),
            caller: "random",
            beginUserDistribution: true,
            expectedUser: parseEther("16"),
            expectedNode: parseEther("12"),
            expectedFinalised: false,
            expectedUserDistributed: true,
        });
    });

    it("rejects restarting a pending user distribution window", async () => {
        const current = await load().ensure("current");
        await current.minipools.fund("pool", "random", parseEther("32"));
        await current.minipools.beginUserDistribute("pool", { caller: "random" });
        await expectRevert(
            () => current.minipools.beginUserDistribute("pool", { caller: "random" }),
            "User distribution already pending",
        );
    });

    it("allows another user distribution after the previous window expires", async () => {
        const current = await load().ensure("current");
        await current.minipools.fund("pool", "random", parseEther("32"));
        await current.minipools.beginUserDistribute("pool", { caller: "random" });
        await current.time.advanceMinipoolUserDistributeWindow();
        await current.minipools.beginUserDistribute("pool", { caller: "random" });
    });

    it("distributes a withdrawal below the user capital to users", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("15"),
            caller: "nodeWithdrawalAddress",
            expectedUser: parseEther("15"),
            expectedNode: 0n,
            expectedFinalised: true,
            expectedUserDistributed: false,
        });
    });

    it("does not permit a later user withdrawal to create a slash balance", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("28"),
            caller: "nodeWithdrawalAddress",
            expectedUser: parseEther("16"),
            expectedNode: parseEther("12"),
            expectedFinalised: true,
            expectedUserDistributed: false,
        });
        await current.time.advance(14n * ONE_DAY + 1n);
        await current.time.mineBlocks(101n);
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("8"),
            caller: "random",
            beginUserDistribution: true,
            expectedUser: parseEther("8"),
            expectedNode: 0n,
            expectedFinalised: true,
            expectedUserDistributed: true,
        });
        await expectRevert(
            () => current.minipools.slash("pool", { caller: "random" }),
            "No balance to slash",
        );
    });

    it("finalises an unmarked withdrawal below the user capital", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("15"),
            caller: "nodeWithdrawalAddress",
            expectedUser: parseEther("15"),
            expectedNode: 0n,
            expectedFinalised: true,
            expectedUserDistributed: false,
        });
    });

    it("rejects rewards-only distribution when the balance exceeds 8 ETH", async () => {
        const current = await load().ensure("current");
        await current.minipools.fund("pool", "random", parseEther("8.001"));
        await expectRevert(
            () => current.minipools.distributeBalance("pool", {
                caller: "nodeWithdrawalAddress",
                rewardsOnly: true,
            }),
            "Balance exceeds 8 ether",
        );
    });

    it("applies the configured ETH penalty to the node share", async () => {
        const ctx = load();
        const current = await ctx.ensure("current");
        await ctx.fixtures.minipoolPenaltyController.get("penaltyController")
            .setRate("pool", MAX_PENALTY_RATE);
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("36"),
            caller: "nodeWithdrawalAddress",
            expectedUser: parseEther("26.9"),
            expectedNode: parseEther("9.1"),
            expectedFinalised: true,
            expectedUserDistributed: false,
        });
    });

    it("caps an ETH penalty at the maximum rate", async () => {
        const ctx = load();
        const current = await ctx.ensure("current");
        await ctx.fixtures.minipoolPenaltyController.get("penaltyController")
            .setRate("pool", parseEther("0.75"));
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("36"),
            caller: "nodeWithdrawalAddress",
            expectedUser: parseEther("26.9"),
            expectedNode: parseEther("9.1"),
            expectedFinalised: true,
            expectedUserDistributed: false,
        });
    });

    it("disables ETH penalties when the maximum rate is zero", async () => {
        const ctx = load();
        const current = await ctx.ensure("current");
        await current.minipools.setMaximumPenaltyRate(0n);
        await ctx.fixtures.minipoolPenaltyController.get("penaltyController")
            .setRate("pool", MAX_PENALTY_RATE);
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("36"),
            caller: "nodeWithdrawalAddress",
            expectedUser: parseEther("17.8"),
            expectedNode: parseEther("18.2"),
            expectedFinalised: true,
            expectedUserDistributed: false,
        });
    });

    it("manually finalises a user-distributed withdrawal", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("36"),
            caller: "random",
            beginUserDistribution: true,
            expectedUser: parseEther("17.8"),
            expectedNode: parseEther("18.2"),
            expectedFinalised: false,
            expectedUserDistributed: true,
        });
        await finaliseMinipoolAndAssert(current, "pool", { caller: "nodeWithdrawalAddress" });
    });

    it("rejects finalising a user-distributed withdrawal twice", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("36"),
            caller: "random",
            beginUserDistribution: true,
            expectedUser: parseEther("17.8"),
            expectedNode: parseEther("18.2"),
            expectedFinalised: false,
            expectedUserDistributed: true,
        });
        await current.minipools.finalise("pool", { caller: "nodeWithdrawalAddress" });
        await expectRevert(
            () => current.minipools.finalise("pool", { caller: "nodeWithdrawalAddress" }),
            "Minipool has already been finalised",
        );
    });

    it("rejects finalisation before user distribution", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.minipools.finalise("pool", { caller: "nodeWithdrawalAddress" }),
            "Can only manually finalise after user distribution",
        );
    });

    it("rejects finalisation by a random address", async () => {
        const current = await load().ensure("current");
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("36"),
            caller: "random",
            beginUserDistribution: true,
            expectedUser: parseEther("17.8"),
            expectedNode: parseEther("18.2"),
            expectedFinalised: false,
            expectedUserDistributed: true,
        });
        await expectRevert(
            () => current.minipools.finalise("pool", { caller: "random" }),
            "Invalid minipool owner",
        );
    });

    it("allows anyone to slash a user-distributed shortfall", async () => {
        const current = await load().ensure("current");
        const token = await current.contracts.rocketTokenRPL.getAddress();
        const before = await current.contracts.rocketVault.balanceOfToken("rocketAuctionManager", token);
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("8"),
            caller: "random",
            beginUserDistribution: true,
            expectedUser: parseEther("8"),
            expectedNode: 0n,
            expectedFinalised: false,
            expectedUserDistributed: true,
        });
        assert.equal(await current.minipools.rplSlashed("pool"), false);
        await current.minipools.slash("pool", { caller: "random" });
        assert.equal(await current.minipools.rplSlashed("pool"), true);
        const after = await current.contracts.rocketVault.balanceOfToken("rocketAuctionManager", token);
        assert.equal(after - before, parseEther("800"));
    });

    it("automatically slashes a shortfall when the owner distributes", async () => {
        const current = await load().ensure("current");
        const token = await current.contracts.rocketTokenRPL.getAddress();
        const before = await current.contracts.rocketVault.balanceOfToken("rocketAuctionManager", token);
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("8"),
            caller: "nodeWithdrawalAddress",
            expectedUser: parseEther("8"),
            expectedNode: 0n,
            expectedFinalised: true,
        });
        assert.equal(await current.minipools.rplSlashed("pool"), true);
        const after = await current.contracts.rocketVault.balanceOfToken("rocketAuctionManager", token);
        assert.equal(after - before, parseEther("800"));
    });

    it("rejects a permissionless capital distribution before its window", async () => {
        const current = await load().ensure("current");
        await current.minipools.fund("pool", "random", parseEther("15"));
        await expectRevert(
            () => current.minipools.distributeBalance("pool", { caller: "random" }),
            "Only owner can distribute right now",
        );
    });

    it("cannot block permissionless user distribution with a reverting withdrawal address", async () => {
        const ctx = load();
        const current = await ctx.ensure("current");
        const receiver = await ctx.fixtures.revertingReceiver.deploy("maliciousWithdrawal");
        await receiver.setEnabled(true);
        await current.nodes.setWithdrawalAddress("node", receiver.address, {
            caller: "nodeWithdrawalAddress",
            confirm: true,
        });
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("36"),
            caller: "random",
            beginUserDistribution: true,
            expectedUser: parseEther("17.8"),
            expectedNode: parseEther("18.2"),
            expectedFinalised: false,
            expectedUserDistributed: true,
        });
    });

    it("accepts validator balance across multiple transfers", async () => {
        const current = await load().ensure("current");
        await current.minipools.fund("pool", "random", parseEther("18"));
        await current.minipools.fund("pool", "depositor", parseEther("18"));
        await current.minipools.beginUserDistribute("pool", { caller: "random" });
        await current.time.advanceMinipoolUserDistributeStart();
        await current.minipools.distributeBalance("pool", { caller: "random" });
        assert.equal((await current.minipools.details("pool")).userDistributed, true);
    });

    it("skims rewards when called by the node", async () => {
        const current = await load().ensure("current");
        await current.minipools.fund("pool", "depositor", parseEther("1"));
        await skimRewardsAndAssert(current, "pool", { caller: "node" });
    });

    it("skims rewards when called by a random address", async () => {
        const current = await load().ensure("current");
        await current.minipools.fund("pool", "depositor", parseEther("1"));
        await skimRewardsAndAssert(current, "pool", { caller: "random" });
    });

    it("skims rewards repeatedly", async () => {
        const current = await load().ensure("current");
        for (let index = 0; index < 2; index++) {
            await current.minipools.fund("pool", "depositor", parseEther("1"));
            await skimRewardsAndAssert(current, "pool", { caller: "random" });
        }
    });

    it("skims rewards interchangeably between the node and another caller", async () => {
        const current = await load().ensure("current");
        await current.minipools.fund("pool", "depositor", parseEther("1"));
        await skimRewardsAndAssert(current, "pool", { caller: "random" });
        await current.minipools.fund("pool", "depositor", parseEther("1"));
        await skimRewardsAndAssert(current, "pool", { caller: "node" });
    });
});
