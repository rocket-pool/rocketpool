import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import {
    createRecurringPaymentAndAssert,
    fundTreasuryAndAssert,
    payOutRecurringPaymentsAndAssert,
    updateRecurringPaymentAndAssert,
    withdrawTreasuryBalanceAndAssert,
} from "../../scenarios/pdao/treasury";

const ONE_DAY = 24n * 60n * 60n;

describe("RocketDAOProtocol treasury", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.upgradeTo("current");
    });

    it("creates and updates a recurring payment through bootstrap", async () => {
        const current = await load().ensure("current");
        const startTime = await current.time.latest();
        await createRecurringPaymentAndAssert(current, "Test contract", {
            recipient: "recipient1",
            amountPerPeriod: parseEther("5"),
            periodLength: ONE_DAY,
            startTime,
            numPeriods: 1n,
        });
        await updateRecurringPaymentAndAssert(current, "Test contract", {
            recipient: "recipient1",
            amountPerPeriod: parseEther("10"),
            periodLength: ONE_DAY,
            numPeriods: 1n,
        });
    });

    it("rejects payout of a nonexistent recurring payment", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.pdao.treasury.payOut(["Invalid contract"], {
                caller: "recipient1",
            }),
            "Contract does not exist",
        );
    });

    it("accrues and withdraws two daily recurring payments", async () => {
        const current = await load().ensure("current");
        await fundTreasuryAndAssert(current, "funder", parseEther("10"));
        await createRecurringPaymentAndAssert(current, "Test contract", {
            recipient: "recipient1",
            amountPerPeriod: parseEther("5"),
            periodLength: ONE_DAY,
            startTime: await current.time.latest(),
            numPeriods: 2n,
        });
        await current.time.advance(ONE_DAY + 1n);
        await payOutRecurringPaymentsAndAssert(current, ["Test contract"], {
            caller: "recipient1",
        });
        await current.time.advance(ONE_DAY + 1n);
        await payOutRecurringPaymentsAndAssert(current, ["Test contract"], {
            caller: "recipient1",
        });
        assert.equal(
            await withdrawTreasuryBalanceAndAssert(current, "recipient1", {
                caller: "recipient1",
            }),
            parseEther("10"),
        );
    });

    it("caps catch-up payout at the configured number of periods", async () => {
        const current = await load().ensure("current");
        await fundTreasuryAndAssert(current, "funder", parseEther("20"));
        await createRecurringPaymentAndAssert(current, "Test contract", {
            recipient: "recipient1",
            amountPerPeriod: parseEther("5"),
            periodLength: ONE_DAY,
            startTime: await current.time.latest(),
            numPeriods: 4n,
        });
        await current.time.advance(10n * ONE_DAY + 1n);
        await payOutRecurringPaymentsAndAssert(current, ["Test contract"], {
            caller: "recipient1",
        });
        assert.equal(
            await withdrawTreasuryBalanceAndAssert(current, "recipient1", {
                caller: "recipient1",
            }),
            parseEther("20"),
        );
    });

    it("pays out multiple recurring payments together", async () => {
        const current = await load().ensure("current");
        await fundTreasuryAndAssert(current, "funder", parseEther("20"));
        const startTime = await current.time.latest();
        await createRecurringPaymentAndAssert(current, "Test contract 1", {
            recipient: "recipient1",
            amountPerPeriod: parseEther("5"),
            periodLength: ONE_DAY,
            startTime,
            numPeriods: 1n,
        });
        await createRecurringPaymentAndAssert(current, "Test contract 2", {
            recipient: "recipient1",
            amountPerPeriod: parseEther("10"),
            periodLength: ONE_DAY,
            startTime,
            numPeriods: 1n,
        });
        await current.time.advance(ONE_DAY + 1n);
        await payOutRecurringPaymentsAndAssert(
            current,
            ["Test contract 1", "Test contract 2"],
            { caller: "recipient1" },
        );
        assert.equal(
            await withdrawTreasuryBalanceAndAssert(current, "recipient1", {
                caller: "recipient1",
            }),
            parseEther("15"),
        );
    });

    it("pays out multiple recurring payments separately", async () => {
        const current = await load().ensure("current");
        await fundTreasuryAndAssert(current, "funder", parseEther("20"));
        const startTime = await current.time.latest();
        await createRecurringPaymentAndAssert(current, "Test contract 1", {
            recipient: "recipient1",
            amountPerPeriod: parseEther("5"),
            periodLength: ONE_DAY,
            startTime,
            numPeriods: 1n,
        });
        await createRecurringPaymentAndAssert(current, "Test contract 2", {
            recipient: "recipient1",
            amountPerPeriod: parseEther("10"),
            periodLength: ONE_DAY,
            startTime,
            numPeriods: 1n,
        });
        await current.time.advance(ONE_DAY + 1n);
        await payOutRecurringPaymentsAndAssert(current, ["Test contract 1"], {
            caller: "recipient1",
        });
        assert.equal(
            await withdrawTreasuryBalanceAndAssert(current, "recipient1", {
                caller: "recipient1",
            }),
            parseEther("5"),
        );
        await payOutRecurringPaymentsAndAssert(current, ["Test contract 2"], {
            caller: "recipient1",
        });
        assert.equal(
            await withdrawTreasuryBalanceAndAssert(current, "recipient1", {
                caller: "recipient1",
            }),
            parseEther("10"),
        );
    });

    it("preserves back pay when changing the payment recipient", async () => {
        const current = await load().ensure("current");
        await fundTreasuryAndAssert(current, "funder", parseEther("20"));
        await createRecurringPaymentAndAssert(current, "Test contract", {
            recipient: "recipient1",
            amountPerPeriod: parseEther("5"),
            periodLength: ONE_DAY,
            startTime: await current.time.latest(),
            numPeriods: 2n,
        });
        await current.time.advance(ONE_DAY + 1n);
        await updateRecurringPaymentAndAssert(current, "Test contract", {
            recipient: "recipient2",
            amountPerPeriod: parseEther("5"),
            periodLength: ONE_DAY,
            numPeriods: 2n,
        });
        await current.time.advance(ONE_DAY + 1n);
        await payOutRecurringPaymentsAndAssert(current, ["Test contract"], {
            caller: "recipient1",
        });
        assert.equal(
            await withdrawTreasuryBalanceAndAssert(current, "recipient1", {
                caller: "recipient1",
            }),
            parseEther("5"),
        );
        assert.equal(
            await withdrawTreasuryBalanceAndAssert(current, "recipient2", {
                caller: "recipient2",
            }),
            parseEther("5"),
        );
    });

    it("rejects payout when the treasury cannot afford it", async () => {
        const current = await load().ensure("current");
        await createRecurringPaymentAndAssert(current, "Test contract", {
            recipient: "recipient1",
            amountPerPeriod: parseEther("5"),
            periodLength: ONE_DAY,
            startTime: await current.time.latest(),
            numPeriods: 1n,
        });
        await current.time.advance(ONE_DAY + 1n);
        await expectRevert(
            () => current.pdao.treasury.payOut(["Test contract"], {
                caller: "recipient1",
            }),
            "Insufficient treasury balance for payout",
        );
    });
});
