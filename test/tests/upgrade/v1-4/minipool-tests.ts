import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load, type ProtocolV14 } from "../../../harness";
import { depositMegapoolValidatorScenario } from "../../../scenarios/megapool/deposit-validator";
import { distributeMinipoolBalanceAndAssert } from "../../../scenarios/minipool/distribute-balance";
import { submitMinipoolPenaltyScenario } from "../../../scenarios/network/submit-minipool-penalty";
import { unstakeLegacyRplAndAssert } from "../../../scenarios/node/rpl-staking";

const BOND_16 = parseEther("16");
const BOND_8 = parseEther("8");

async function bootstrapTrustedNodes(protocol: ProtocolV14): Promise<void> {
    for (const [name, id] of [["trusted1", "saas_1"], ["trusted2", "saas_2"], ["trusted3", "saas_3"]] as const) {
        await protocol.nodes.register(name);
        await protocol.odao.members.bootstrap(name, { id, url: "node@home.com" });
    }
}

describe("Rocket Pool 1.4 legacy minipool upgrade", () => {
    it("assigns an initialised legacy minipool before a megapool validator", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.nodes.stakeMinimumRpl("node", { minipools: 1, bond: BOND_16 });
        await rp131.minipools.create("pool", { node: "node", bond: BOND_16 });
        assert.equal((await rp131.minipools.details("pool")).status, 0);
        const rp14 = await rp131.upgradeTo("1.4");
        await depositMegapoolValidatorScenario(rp14, "node", { expectedStatus: "queue" });
        await rp14.depositPool.fund("depositor", parseEther("32"));
        assert.equal((await rp14.minipools.details("pool")).status, 1);
        await rp14.depositPool.fund("depositor", parseEther("32"));
        assert.deepEqual(await rp14.megapools.validator("node", 0n), {
            staked: false,
            inQueue: false,
            inPrestake: true,
        });
    });

    it("uses deposit credit created by a vacant minipool migration", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.odao.settings.minipools.setPromotionScrubPeriod(24n * 60n * 60n);
        await rp131.nodes.register("node");
        await rp131.nodes.stakeMinimumRpl("node", { minipools: 7, bond: BOND_8 });
        await rp131.minipools.createVacant("vacant", { node: "node", bond: BOND_8 });
        const rp14 = await rp131.upgradeTo("1.4");
        await rp14.time.advanceMinipoolPromotionScrubPeriod();
        await rp14.minipools.promote("vacant");
        assert.equal(await rp14.nodes.depositCredit("node"), parseEther("24"));
        await rp14.depositPool.fund("depositor", parseEther("24"));
        await rp14.megapools.deploy("node");
        for (let i = 0; i < 6; i++) {
            await depositMegapoolValidatorScenario(rp14, "node", {
                bond: parseEther("4"),
                credit: parseEther("4"),
                expectedStatus: "queue",
            });
            const balances = await rp14.depositPool.balances();
            assert.equal(balances.total, parseEther("24"));
            assert.equal(balances.node, parseEther(String(4 * (i + 1))));
        }
        for (let i = 0; i < 3; i++) await rp14.depositPool.fund("depositor", parseEther("32"));
        assert.deepEqual(await rp14.depositPool.balances(), {
            total: parseEther("24"),
            user: parseEther("12"),
            node: parseEther("12"),
        });
        for (let i = 0; i < 3; i++) await rp14.depositPool.fund("depositor", parseEther("32"));
        assert.deepEqual(await rp14.depositPool.balances(), {
            total: parseEther("24"),
            user: parseEther("24"),
            node: 0n,
        });
    });

    describe("staking legacy minipool", () => {
        before(async () => {
            const rp131 = await load().ensure("1.3.1");
            await rp131.nodes.register("node");
            await rp131.nodes.stakeMinimumRpl("node", { minipools: 1, bond: BOND_16 });
            await rp131.minipools.create("pool", { node: "node", bond: BOND_16 });
            const rp14 = await rp131.upgradeTo("1.4");
            await rp14.depositPool.fund("depositor", parseEther("32"));
            await rp14.time.advanceMinipoolScrubPeriod();
            await rp14.minipools.stake("pool");
            await bootstrapTrustedNodes(rp14);
            const guardian = await rp14.context.guardian();
            await (await rp14.contracts.rocketMinipoolPenalty.connect(guardian).setMaxPenaltyRate(parseEther("1"))).wait();
        });

        it("rejects bond reduction after upgrade", async () => {
            const rp14 = await load().ensure("1.4");
            await expectRevert(() => rp14.minipools.reduceBond("pool"), "Minipool bond reductions are no longer available");
        });

        it("provisions the expected express queue tickets", async () => {
            const rp14 = await load().ensure("1.4");
            assert.equal(await rp14.nodes.expressTicketCount("node"), 4n);
            assert.equal(await rp14.nodes.expressTicketsProvisioned("node"), false);
            await rp14.nodes.provisionExpressTickets("node");
            assert.equal(await rp14.nodes.expressTicketCount("node"), 4n);
            assert.equal(await rp14.nodes.expressTicketsProvisioned("node"), true);
        });

        it("exits and distributes a normal validator balance", async () => {
            const rp14 = await load().ensure("1.4");
            await distributeMinipoolBalanceAndAssert(rp14, "pool", {
                balance: parseEther("36"),
                expectedUser: parseEther("17.8"),
                expectedNode: parseEther("18.2"),
            });
        });

        it("slashes legacy RPL when the exit balance is short", async () => {
            const rp14 = await load().ensure("1.4");
            const beforeStake = await rp14.nodes.legacyStakedRpl("node");
            await distributeMinipoolBalanceAndAssert(rp14, "pool", {
                balance: parseEther("15"),
                expectedUser: parseEther("15"),
                expectedNode: 0n,
            });
            assert.equal(beforeStake - await rp14.nodes.legacyStakedRpl("node"), parseEther("100"));
        });

        it("caps slashing at the legacy RPL balance", async () => {
            const rp14 = await load().ensure("1.4");
            await distributeMinipoolBalanceAndAssert(rp14, "pool", {
                balance: parseEther("10"),
                expectedUser: parseEther("10"),
                expectedNode: 0n,
            });
            assert.equal(await rp14.nodes.legacyStakedRpl("node"), 0n);
        });

        it("accepts trusted-node penalty consensus", async () => {
            const rp14 = await load().ensure("1.4");
            for (let block = 1n; block < 5n; block++) {
                for (const caller of ["trusted1", "trusted2", "trusted3"]) {
                    await submitMinipoolPenaltyScenario(rp14, { minipool: "pool", caller, block });
                }
                assert.equal(await rp14.contracts.rocketNetworkPenalties.getCurrentPenaltyRunningTotal(), block);
            }
            const address = rp14.minipools.get("pool").address;
            assert.equal(await rp14.contracts.rocketNetworkPenalties.getPenaltyCount(address), 4n);
            assert.equal(await rp14.contracts.rocketNetworkPenalties.getCurrentMaxPenalty(), 2496n);
        });

        it("rejects penalty submissions by a regular node", async () => {
            const rp14 = await load().ensure("1.4");
            const signer = await rp14.context.actor("node");
            await expectRevert(
                () => rp14.contracts.rocketNetworkPenalties.connect(signer).submitPenalty(
                    rp14.minipools.get("pool").address,
                    10n,
                ),
                "Invalid trusted node",
            );
        });
    });

    describe("multiple staking legacy minipools", () => {
        before(async () => {
            const rp131 = await load().ensure("1.3.1");
            await rp131.nodes.register("node");
            await rp131.nodes.stakeMinimumRpl("node", { minipools: 3, bond: BOND_16 });
            for (const name of ["pool1", "pool2", "pool3"]) {
                await rp131.minipools.create(name, { node: "node", bond: BOND_16 });
            }
            const rp14 = await rp131.upgradeTo("1.4");
            for (let i = 0; i < 3; i++) await rp14.depositPool.fund("depositor", parseEther("32"));
            await rp14.time.advanceMinipoolScrubPeriod();
            for (const name of ["pool1", "pool2", "pool3"]) await rp14.minipools.stake(name);
            const guardian = await rp14.context.guardian();
            await (await rp14.contracts.rocketMinipoolPenalty.connect(guardian).setMaxPenaltyRate(parseEther("1"))).wait();
        });

        it("prevents unstaking below the minimum until all legacy minipools exit", async () => {
            const rp14 = await load().ensure("1.4");
            const beforeStake = await rp14.nodes.legacyStakedRpl("node");
            await distributeMinipoolBalanceAndAssert(rp14, "pool1", {
                balance: parseEther("15"), expectedUser: parseEther("15"), expectedNode: 0n,
            });
            await expectRevert(
                () => rp14.nodes.unstakeLegacyRpl("node", parseEther("100")),
                "Insufficient legacy staked RPL",
            );
            for (const name of ["pool2", "pool3"]) {
                await distributeMinipoolBalanceAndAssert(rp14, name, {
                    balance: parseEther("15"), expectedUser: parseEther("15"), expectedNode: 0n,
                });
            }
            const afterStake = await rp14.nodes.legacyStakedRpl("node");
            assert.equal(beforeStake - afterStake, parseEther("300"));
            await unstakeLegacyRplAndAssert(rp14, "node", afterStake);
        });
    });
});
