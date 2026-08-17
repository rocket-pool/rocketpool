import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import {
    approveFixedSupplyRplAndAssert,
    mintFixedSupplyRplAndAssert,
    swapFixedSupplyRplAndAssert,
} from "../../scenarios/token/fixed-supply-rpl";
import {
    claimRplInflationAndAssert,
    dailyInflationRate,
    setRplInflationConfigAndAssert,
} from "../../scenarios/token/rpl-inflation";

const DAY = 24n * 60n * 60n;
const INITIAL_FIXED_SUPPLY_BALANCE = parseEther("100");

describe("RocketTokenRPL", () => {
    before(async () => {
        await load().ensure("current");
    });

    describe("fixed-supply migration", () => {
        before(async () => {
            const current = await load().ensure("current");
            await mintFixedSupplyRplAndAssert(current, {
                holder: "userOne",
                amount: INITIAL_FIXED_SUPPLY_BALANCE,
            });
        });

        it("swaps the full fixed-supply RPL balance for RPL", async () => {
            const current = await load().ensure("current");
            await approveFixedSupplyRplAndAssert(current, {
                holder: "userOne",
                amount: INITIAL_FIXED_SUPPLY_BALANCE,
            });
            await swapFixedSupplyRplAndAssert(current, {
                holder: "userOne",
                amount: INITIAL_FIXED_SUPPLY_BALANCE,
            });
        });

        it("swaps less fixed-supply RPL than the approved amount", async () => {
            const current = await load().ensure("current");
            const allowance = INITIAL_FIXED_SUPPLY_BALANCE / 2n;
            await approveFixedSupplyRplAndAssert(current, {
                holder: "userOne",
                amount: allowance,
            });
            await swapFixedSupplyRplAndAssert(current, {
                holder: "userOne",
                amount: allowance - parseEther("0.000001"),
            });
        });

        it("rejects swapping more fixed-supply RPL than approved", async () => {
            const current = await load().ensure("current");
            await approveFixedSupplyRplAndAssert(current, {
                holder: "userOne",
                amount: INITIAL_FIXED_SUPPLY_BALANCE - parseEther("0.000001"),
            });
            await expectRevert(
                () => current.tokens.swapFixedSupplyRpl("userOne", INITIAL_FIXED_SUPPLY_BALANCE),
                "ERC20: transfer amount exceeds allowance",
            );
        });

        it("rejects swapping more fixed-supply RPL than the holder owns", async () => {
            const current = await load().ensure("current");
            await approveFixedSupplyRplAndAssert(current, {
                holder: "userOne",
                amount: INITIAL_FIXED_SUPPLY_BALANCE,
            });
            await expectRevert(
                () => current.tokens.swapFixedSupplyRpl(
                    "userOne",
                    INITIAL_FIXED_SUPPLY_BALANCE + parseEther("0.000001"),
                ),
                "ERC20: transfer amount exceeds balance",
            );
        });
    });

    describe("inflation start time", () => {
        it("rejects a start-time update from a non-guardian", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            await expectRevert(
                () => current.pdao.settings.inflation.setStartTime(now + 3600n, {
                    caller: "userOne",
                }),
                "Account is not a temporary guardian",
            );
        });

        it("sets a future inflation start time", async () => {
            const current = await load().ensure("current");
            const startTime = await current.time.latest() + 3600n;
            await current.pdao.settings.inflation.setStartTime(startTime);
            assert.equal(
                await current.contracts.rocketTokenRPL.getInflationIntervalStartTime(),
                startTime,
            );
        });

        it("changes a future inflation start time twice", async () => {
            const current = await load().ensure("current");
            let startTime = await current.time.latest() + 3600n;
            await current.pdao.settings.inflation.setStartTime(startTime);
            await current.time.advance(1800n);
            startTime = await current.time.latest() + 3600n;
            await current.pdao.settings.inflation.setStartTime(startTime);
            assert.equal(
                await current.contracts.rocketTokenRPL.getInflationIntervalStartTime(),
                startTime,
            );
        });

        it("rejects an inflation start time in the past", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            await expectRevert(
                () => current.pdao.settings.inflation.setStartTime(now - 1800n),
                "Inflation interval start time must be in the future",
            );
        });

        it("rejects changing the start time after inflation begins", async () => {
            const current = await load().ensure("current");
            const startTime = await current.time.latest() + 3600n;
            await current.pdao.settings.inflation.setStartTime(startTime);
            await current.time.advance(3660n);
            const nextStartTime = await current.time.latest() + 3600n;
            await expectRevert(
                () => current.pdao.settings.inflation.setStartTime(nextStartTime),
                "Inflation has already started",
            );
        });
    });

    describe("inflation minting", () => {
        it("mints no inflation before the start time", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            await setRplInflationConfigAndAssert(current, {
                startTime: now + 3600n,
                yearlyTarget: 0.05,
            });
            assert.equal(await claimRplInflationAndAssert(current, {
                caller: "userOne",
                claimTime: now + 1800n,
            }), 0n);
        });

        it("mints no inflation before a complete interval passes", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            await setRplInflationConfigAndAssert(current, {
                startTime: now + 1800n,
                yearlyTarget: 0.05,
            });
            assert.equal(await claimRplInflationAndAssert(current, {
                caller: "userOne",
                claimTime: now + 3600n,
            }), 0n);
        });

        it("mints midway through the second interval and after subsequent intervals", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            let claimTime = now + DAY * 5n / 2n;
            await setRplInflationConfigAndAssert(current, {
                startTime: now + DAY,
                yearlyTarget: 0.05,
            });
            await claimRplInflationAndAssert(current, { caller: "userOne", claimTime });
            claimTime += DAY;
            await claimRplInflationAndAssert(current, { caller: "userOne", claimTime });
            claimTime += DAY;
            await claimRplInflationAndAssert(current, { caller: "userOne", claimTime });
        });

        it("mints inflation over irregular intervals", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            const halfInterval = DAY / 2n;
            let claimTime = now + DAY * 5n;
            await setRplInflationConfigAndAssert(current, {
                startTime: now + DAY,
                yearlyTarget: 0.025,
            });
            await claimRplInflationAndAssert(current, { caller: "userOne", claimTime });
            for (const halfIntervals of [3n, 10n, 20n, 24n, 32n, 38n, 53n, 70n]) {
                claimTime += halfInterval * halfIntervals;
                await claimRplInflationAndAssert(current, { caller: "userOne", claimTime });
            }
        });

        it("mints one year of 5% inflation in one claim", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            const startTime = now + DAY;
            await setRplInflationConfigAndAssert(current, { startTime, yearlyTarget: 0.05 });
            await claimRplInflationAndAssert(current, {
                caller: "userOne",
                claimTime: startTime + DAY * 365n,
                expectedWholeSupply: 18_900_000n,
            });
        });

        it("mints one year of 5% inflation in quarterly claims", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            const startTime = now + DAY;
            const quarter = DAY * 365n / 4n;
            let claimTime = startTime + quarter;
            await setRplInflationConfigAndAssert(current, { startTime, yearlyTarget: 0.05 });
            for (let quarterIndex = 0; quarterIndex < 4; quarterIndex += 1) {
                await claimRplInflationAndAssert(current, {
                    caller: "userOne",
                    claimTime,
                    expectedWholeSupply: quarterIndex === 3 ? 18_900_000n : undefined,
                });
                claimTime += quarter;
            }
        });

        it("mints two years of 5% inflation in half-year claims", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            const startTime = now + DAY;
            const halfYear = DAY * 365n / 2n;
            let claimTime = startTime + halfYear;
            await setRplInflationConfigAndAssert(current, { startTime, yearlyTarget: 0.05 });
            for (let halfIndex = 0; halfIndex < 4; halfIndex += 1) {
                await claimRplInflationAndAssert(current, {
                    caller: "userOne",
                    claimTime,
                    expectedWholeSupply: halfIndex === 3 ? 19_845_000n : undefined,
                });
                claimTime += halfYear;
            }
        });

        it("stops minting after the inflation target is set to zero", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            const startTime = now + DAY;
            let claimTime = startTime + DAY * 365n;
            await setRplInflationConfigAndAssert(current, { startTime, yearlyTarget: 0.05 });
            await claimRplInflationAndAssert(current, {
                caller: "userOne",
                claimTime,
                expectedWholeSupply: 18_900_000n,
            });

            const pausedRate = dailyInflationRate(0);
            await current.pdao.settings.inflation.setIntervalRate(pausedRate);
            assert.equal(await current.contracts.rocketTokenRPL.getInflationIntervalRate(), pausedRate);
            claimTime += DAY * 365n;
            assert.equal(await claimRplInflationAndAssert(current, {
                caller: "userOne",
                claimTime,
            }), 0n);
        });

        it("resumes minting after restoring the inflation target", async () => {
            const current = await load().ensure("current");
            const now = await current.time.latest();
            const startTime = now + DAY;
            let claimTime = startTime + DAY * 365n;
            await setRplInflationConfigAndAssert(current, { startTime, yearlyTarget: 0.05 });
            await claimRplInflationAndAssert(current, {
                caller: "userOne",
                claimTime,
                expectedWholeSupply: 18_900_000n,
            });

            await current.pdao.settings.inflation.setIntervalRate(dailyInflationRate(0));
            claimTime += DAY * 365n;
            await claimRplInflationAndAssert(current, {
                caller: "userOne",
                claimTime,
                expectedWholeSupply: 18_900_000n,
            });

            await current.pdao.settings.inflation.setIntervalRate(dailyInflationRate(0.05));
            claimTime += DAY * 365n;
            await claimRplInflationAndAssert(current, {
                caller: "userOne",
                claimTime,
                expectedWholeSupply: 19_845_000n,
            });
        });
    });
});
