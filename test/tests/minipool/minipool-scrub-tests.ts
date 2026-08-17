import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import { closeMinipoolScenario } from "../../scenarios/minipool/close-minipool";
import { voteScrubScenario } from "../../scenarios/minipool/vote-scrub";

const ONE_HOUR = 60n * 60n;
const SCRUB_PERIOD = 24n * ONE_HOUR;
const LAUNCH_TIMEOUT = 72n * ONE_HOUR;
const WITHDRAWAL_DELAY = 20n;
const BOND = parseEther("16");
const RETURNED_FUNDS = parseEther("16");
const MINIPOOL_SALT = 1n;

describe("RocketMinipool scrubbing", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");

        await rp131.nodes.register("node");
        await rp131.nodes.setWithdrawalAddress("node", "nodeWithdrawalAddress", {
            confirm: true,
        });

        for (const [name, id] of [
            ["trustedNode1", "saas_1"],
            ["trustedNode2", "saas_2"],
            ["trustedNode3", "saas_3"],
        ] as const) {
            await rp131.nodes.register(name);
            await rp131.odao.members.bootstrap(name, {
                id,
                url: "node@home.com",
            });
        }

        await rp131.pdao.settings.minipools.setLaunchTimeout(LAUNCH_TIMEOUT);
        await rp131.pdao.settings.minipools.setWithdrawalDelay(WITHDRAWAL_DELAY);
        await rp131.odao.settings.minipools.setScrubPeriod(SCRUB_PERIOD);
        await rp131.pdao.settings.network.setRethCollateralTarget(parseEther("50"));

        await rp131.depositPool.fund("depositor", BOND);
        await rp131.nodes.stakeMinimumRpl("node", {
            minipools: 7,
            bond: BOND,
        });
        await rp131.minipools.create("pool", {
            node: "node",
            bond: BOND,
            salt: MINIPOOL_SALT,
        });
    });

    describe("current compatibility", () => {
        before(async () => {
            const rp131 = await load().ensure("1.3.1");
            await rp131.upgradeTo("current");
        });

        it("rejects staking before the scrub period has elapsed", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.minipools.stake("pool"),
                "Not enough time has passed to stake",
            );
        });

        it("stakes after the scrub period has elapsed", async () => {
            const current = await load().ensure("current");
            await current.time.advanceMinipoolScrubPeriod();
            await current.minipools.stake("pool");
        });

        it("lets trusted nodes scrub a prelaunch minipool without a penalty", async () => {
            const current = await load().ensure("current");
            await voteScrubScenario(current, { minipool: "pool", caller: "trustedNode1" });
            await voteScrubScenario(current, { minipool: "pool", caller: "trustedNode2" });
        });

        it("lets trusted nodes scrub a prelaunch minipool with a penalty", async () => {
            const current = await load().ensure("current");
            await current.odao.settings.minipools.setScrubPenaltyEnabled(true);
            await voteScrubScenario(current, { minipool: "pool", caller: "trustedNode1" });
            await voteScrubScenario(current, { minipool: "pool", caller: "trustedNode2" });
        });

        it("rejects a second scrub vote from the same trusted node", async () => {
            const current = await load().ensure("current");
            await voteScrubScenario(current, { minipool: "pool", caller: "trustedNode1" });
            await expectRevert(
                () => voteScrubScenario(current, {
                    minipool: "pool",
                    caller: "trustedNode1",
                }),
                "Member has already voted to scrub",
            );
        });

        it("rejects scrub votes for a staking minipool", async () => {
            const current = await load().ensure("current");
            await current.time.advanceMinipoolScrubPeriod();
            await current.minipools.stake("pool");
            await expectRevert(
                () => voteScrubScenario(current, {
                    minipool: "pool",
                    caller: "trustedNode1",
                }),
                "The minipool can only be scrubbed while in prelaunch",
            );
        });

        it("rejects a launch timeout below the scrub period", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.pdao.settings.minipools.setLaunchTimeout(SCRUB_PERIOD - 1n),
                "Launch timeout must be greater than scrub period",
            );
        });

        it("rejects a scrub period above the launch timeout", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.odao.settings.minipools.setScrubPeriod(LAUNCH_TIMEOUT + 1n),
                "Scrub period must be less than launch timeout",
            );
        });

        describe("with a scrubbed minipool", () => {
            before(async () => {
                const current = await load().ensure("current");
                await voteScrubScenario(current, {
                    minipool: "pool",
                    caller: "trustedNode1",
                });
                await voteScrubScenario(current, {
                    minipool: "pool",
                    caller: "trustedNode2",
                });
            });

            it("closes before funds are returned", async () => {
                const current = await load().ensure("current");
                await closeMinipoolScenario(current, {
                    minipool: "pool",
                    caller: "node",
                });
            });

            it("closes after funds are returned", async () => {
                const current = await load().ensure("current");
                await current.minipools.fund("pool", "funder", RETURNED_FUNDS);
                await closeMinipoolScenario(current, {
                    minipool: "pool",
                    caller: "node",
                });
            });

            it("rejects closing twice", async () => {
                const current = await load().ensure("current");
                await closeMinipoolScenario(current, {
                    minipool: "pool",
                    caller: "node",
                });
                await expectRevert(
                    () => current.minipools.close("pool", { caller: "node" }),
                    "Minipool already closed",
                );
            });
        });
    });
});
