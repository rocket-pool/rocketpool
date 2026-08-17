import assert from "assert";
import { parseEther } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import { assignDepositsAndAssert } from "../../scenarios/deposit/assign-deposits";
import { depositAndAssert } from "../../scenarios/deposit/deposit";
import { before, describe, expectRevert, it, load } from "../../harness";
import { depositMegapoolValidatorScenario } from "../../scenarios/megapool/deposit-validator";
import { submitBalancesScenario } from "../../scenarios/network/submit-balances";

const SLOT_TIMESTAMP = 1_600_000_000n;

describe("RocketDepositPool", () => {
    before(async () => {
        const current = await load().ensure("current");
        await current.nodes.register("node");
        await current.nodes.register("trustedNode");
        await current.odao.members.bootstrap("trustedNode", {
            id: "saas_1",
            url: "node@home.com",
        });
    });

    it("lets a user deposit before and after the rETH exchange rate changes", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.network.setRethCollateralTarget(0n);
        await depositAndAssert(current, { depositor: "staker", amount: parseEther("10") });
        const exchangeRateBefore = await current.tokens.rethExchangeRate();

        const balances = await current.network.balances.details();
        const submissionBlock = balances.block + 1n;
        assert(submissionBlock < BigInt(await ethers.provider.getBlockNumber()));
        await submitBalancesScenario(current, {
            caller: "trustedNode",
            block: submissionBlock,
            slotTimestamp: SLOT_TIMESTAMP,
            totalEth: parseEther("13"),
            stakingEth: 0n,
            rethSupply: await current.tokens.rethSupply(),
        });

        const exchangeRateAfter = await current.tokens.rethExchangeRate();
        assert.notEqual(exchangeRateAfter, exchangeRateBefore);
        await depositAndAssert(current, { depositor: "staker", amount: parseEther("10") });
    });

    it("rejects deposits while deposits are disabled", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.deposits.setEnabled(false);
        await expectRevert(
            () => current.depositPool.deposit("staker", parseEther("10")),
            "Deposits into Rocket Pool are currently disabled",
        );
    });

    it("rejects deposits below the minimum deposit amount", async () => {
        const current = await load().ensure("current");
        const minimum = await current.depositPool.minimumDeposit();
        await expectRevert(
            () => current.depositPool.deposit("staker", minimum / 2n),
            "The deposited amount is less than the minimum deposit size",
        );
    });

    it("rejects deposits that exceed the maximum deposit pool size", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.deposits.setMaximumPoolSize(parseEther("100"));
        await expectRevert(
            () => current.depositPool.deposit("staker", parseEther("101")),
            "The deposit pool size after depositing exceeds the maximum size",
        );
    });

    it("uses queued validator capacity above the maximum deposit pool size", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.deposits.setMaximumPoolSize(parseEther("1"));
        await current.pdao.settings.deposits.setMaximumSocialisedAssignments(0n);
        await expectRevert(
            () => current.depositPool.deposit("staker", parseEther("16")),
            "The deposit pool size after depositing exceeds the maximum size",
        );

        for (let index = 0; index < 4; index += 1) {
            await depositMegapoolValidatorScenario(current, "node");
        }
        await depositAndAssert(current, { depositor: "staker", amount: parseEther("16") });
    });

    it("allows permissionless assignment of queued deposits", async () => {
        const current = await load().ensure("current");
        await assignDepositsAndAssert(current, { caller: "staker", max: 1n });

        await current.pdao.settings.deposits.setAssignmentsEnabled(false);
        await current.depositPool.deposit("staker", parseEther("100"));
        for (let index = 0; index < 3; index += 1) {
            await depositMegapoolValidatorScenario(current, "node");
        }

        await current.pdao.settings.deposits.setAssignmentsEnabled(true);
        await current.pdao.settings.deposits.setMaximumAssignments(3n);
        await current.pdao.settings.deposits.setMaximumSocialisedAssignments(3n);
        await assignDepositsAndAssert(current, { caller: "staker", max: 1n });
    });

    it("rejects assignments while deposit assignment is disabled", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.deposits.setAssignmentsEnabled(false);
        await expectRevert(
            () => current.depositPool.assign(1n, { caller: "staker" }),
            "Deposit assignments are disabled",
        );
    });

    it("calculates the maximum deposit amount from settings and queue capacity", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.deposits.setEnabled(false);
        assert.equal(await current.depositPool.maximumDepositAmount(), 0n);

        await current.pdao.settings.deposits.setEnabled(true);
        const maximum = parseEther("100");
        await current.pdao.settings.deposits.setMaximumPoolSize(maximum);
        assert.equal(await current.depositPool.maximumDepositAmount(), maximum);

        await current.pdao.settings.deposits.setAssignmentsEnabled(false);
        for (let index = 0; index < 4; index += 1) {
            await depositMegapoolValidatorScenario(current, "node");
        }
        await current.pdao.settings.deposits.setAssignmentsEnabled(true);
        assert.equal(
            await current.depositPool.maximumDepositAmount(),
            maximum + parseEther("112"),
        );
    });
});
