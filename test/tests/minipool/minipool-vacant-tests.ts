import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import { closeMinipoolScenario } from "../../scenarios/minipool/close-minipool";
import { createVacantMinipoolScenario } from "../../scenarios/minipool/create-vacant-minipool";
import { promoteVacantMinipoolScenario } from "../../scenarios/minipool/promote-vacant-minipool";
import { refundMinipoolScenario } from "../../scenarios/minipool/refund-minipool";
import { voteScrubScenario } from "../../scenarios/minipool/vote-scrub";

const ONE_HOUR = 60n * 60n;
const LAUNCH_TIMEOUT = 72n * ONE_HOUR;
const WITHDRAWAL_DELAY = 20n;
const PROMOTION_SCRUB_PERIOD = 24n * ONE_HOUR;
const BOND_16 = parseEther("16");
const BOND_8 = parseEther("8");
const LAUNCH_BALANCE = parseEther("32");
const PRE_MIGRATION_BALANCE = parseEther("33");

describe("RocketMinipool vacant minipools", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");

        await rp131.nodes.register("node");
        await rp131.nodes.setWithdrawalAddress("node", "nodeWithdrawalAddress", {
            confirm: true,
        });

        for (const [name, id] of [
            ["trustedNode1", "saas_1"],
            ["trustedNode2", "saas_2"],
        ] as const) {
            await rp131.nodes.register(name);
            await rp131.odao.members.bootstrap(name, {
                id,
                url: "node@home.com",
            });
        }

        await rp131.pdao.settings.minipools.setLaunchTimeout(LAUNCH_TIMEOUT);
        await rp131.pdao.settings.minipools.setWithdrawalDelay(WITHDRAWAL_DELAY);
        await rp131.odao.settings.minipools.setPromotionScrubPeriod(
            PROMOTION_SCRUB_PERIOD,
        );
        await rp131.pdao.settings.network.setRethCollateralTarget(parseEther("50"));
        await rp131.nodes.stakeMinimumRpl("node", {
            minipools: 7,
            bond: BOND_8,
        });

        await createVacantMinipoolScenario(rp131, "pool16", {
            node: "node",
            bond: BOND_16,
        });
        await createVacantMinipoolScenario(rp131, "pool8", {
            node: "node",
            bond: BOND_8,
        });
        assert.equal(
            await rp131.nodes.borrowedEth("node"),
            parseEther("40"),
            "Incorrect total node borrowed ETH",
        );
    });

    describe("historical creation", () => {
        before(async () => {
            const rp131 = await load().ensure("1.3.1");
            await createVacantMinipoolScenario(rp131, "pubkeySource", {
                node: "node",
                bond: BOND_16,
            });
        });

        it("rejects creating a vacant minipool with an existing pubkey", async () => {
            const rp131 = await load().ensure("1.3.1");
            const pubkey = rp131.minipools.get("pubkeySource").pubkey;

            await expectRevert(
                () => rp131.minipools.createVacant("duplicatePubkey", {
                    node: "node",
                    bond: BOND_16,
                    currentBalance: LAUNCH_BALANCE,
                    pubkey,
                }),
                "Validator pubkey is in use",
            );
        });
    });

    describe("current compatibility", () => {
        before(async () => {
            const rp131 = await load().ensure("1.3.1");
            await rp131.upgradeTo("current");
        });

        it("promotes a historical 16 ETH vacant minipool after the scrub period", async () => {
            const current = await load().ensure("current");
            await current.time.advanceMinipoolPromotionScrubPeriod();
            const result = await promoteVacantMinipoolScenario(current, "pool16");

            assert.equal(result.creditDelta, BOND_16);
            assert.equal(await current.nodes.depositCredit("node"), BOND_16);
        });

        it("promotes a historical 8 ETH vacant minipool after the scrub period", async () => {
            const current = await load().ensure("current");
            await current.time.advanceMinipoolPromotionScrubPeriod();
            const result = await promoteVacantMinipoolScenario(current, "pool8");

            assert.equal(result.creditDelta, parseEther("24"));
            assert.equal(await current.nodes.depositCredit("node"), parseEther("24"));
        });

        it("rejects promotion before the scrub period has elapsed", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.minipools.promote("pool16"),
                "Not enough time has passed to promote",
            );
        });

        it("scrubs and closes historical vacant minipools without changing their balances", async () => {
            const current = await load().ensure("current");

            await voteScrubScenario(current, {
                minipool: "pool16",
                caller: "trustedNode1",
            });
            await voteScrubScenario(current, {
                minipool: "pool16",
                caller: "trustedNode2",
            });
            assert.equal(await current.nodes.borrowedEth("node"), parseEther("40"));
            await closeMinipoolScenario(current, {
                minipool: "pool16",
                caller: "node",
            });
            assert.equal(await current.nodes.borrowedEth("node"), parseEther("24"));

            await voteScrubScenario(current, {
                minipool: "pool8",
                caller: "trustedNode1",
            });
            await voteScrubScenario(current, {
                minipool: "pool8",
                caller: "trustedNode2",
            });
            await closeMinipoolScenario(current, {
                minipool: "pool8",
                caller: "node",
            });
            assert.equal(await current.nodes.borrowedEth("node"), 0n);
        });

        it("does not penalise a scrubbed vacant minipool when penalties are enabled", async () => {
            const current = await load().ensure("current");
            await current.odao.settings.minipools.setScrubPenaltyEnabled(true);
            await voteScrubScenario(current, {
                minipool: "pool16",
                caller: "trustedNode1",
            });
            await voteScrubScenario(current, {
                minipool: "pool16",
                caller: "trustedNode2",
            });
        });
    });

    describe("pre-migration rewards", () => {
        before(async () => {
            const rp131 = await load().ensure("1.3.1");
            await createVacantMinipoolScenario(rp131, "rewardPool", {
                node: "node",
                bond: BOND_8,
                currentBalance: PRE_MIGRATION_BALANCE,
            });
            await rp131.upgradeTo("current");
        });

        it("refunds rewards after promoting the historical vacant minipool", async () => {
            const current = await load().ensure("current");
            await current.time.advanceMinipoolPromotionScrubPeriod();
            await promoteVacantMinipoolScenario(current, "rewardPool");

            assert.equal(
                (await current.minipools.details("rewardPool")).nodeRefundBalance,
                parseEther("1"),
            );
            await current.minipools.fund("rewardPool", "skimFunder", parseEther("1"));
            const result = await refundMinipoolScenario(current, "rewardPool");
            assert.equal(result.refund, parseEther("1"));
        });

        it("rejects refunding rewards while the minipool is vacant", async () => {
            const current = await load().ensure("current");
            await expectRevert(
                () => current.minipools.refund("rewardPool"),
                "Vacant minipool cannot refund",
            );
        });
    });
});
