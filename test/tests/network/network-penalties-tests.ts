import assert from "node:assert/strict";
import { parseEther } from "ethers";

import { asNetworkContract, before, describe, expectRevert, it, load, type ProtocolCurrent, type ProtocolV14 } from "../../harness";
import { submitMinipoolPenaltyScenario } from "../../scenarios/network/submit-minipool-penalty";
import { ethers, network } from "../../../test-old/_utils/hardhat-runtime";

const rateKey = (prefix: string, minipool: string) => ethers.solidityPackedKeccak256(
    ["string", "address"], [prefix, minipool],
);

async function rates(current: ProtocolCurrent) {
    const address = current.minipools.get("pool").address;
    const storage = current.contracts.rocketStorage;
    return {
        initialised: await storage.getBool(rateKey("network.penalties.rate.initialised", address)),
        odao: await storage.getUint(rateKey("network.penalties.rate.odao", address)),
        exit: await storage.getUint(rateKey("network.penalties.rate.exit", address)),
        raw: await storage.getUint(rateKey("minipool.penalty.rate", address)),
        effective: await current.minipools.penaltyRate("pool"),
    };
}

async function applyExit(current: ProtocolCurrent, amount = parseEther("0.1")) {
    return asNetworkContract(current, "rocketNetworkExit", async signer => {
        const transaction = await current.contracts.rocketNetworkPenalties.connect(signer).applyExitPenalty(
            current.minipools.get("pool").address, amount,
        );
        return transaction.wait();
    });
}

async function applyOdao(protocol: ProtocolCurrent | ProtocolV14, block: bigint) {
    for (const caller of ["trusted1", "trusted2"]) {
        await submitMinipoolPenaltyScenario(protocol, { minipool: "pool", caller, block });
    }
}

describe("RocketNetworkPenalties combined minipool rates", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.nodes.stakeMinimumRpl("node", { minipools: 1, bond: parseEther("16") });
        await rp131.depositPool.fund("depositor", parseEther("16"));
        await rp131.minipools.create("pool", { node: "node", bond: parseEther("16") });
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.minipools.stake("pool");
        const rp14 = await rp131.upgradeTo("1.4");
        await rp14.minipools.setMaximumPenaltyRate(parseEther("1"));
        for (const name of ["trusted1", "trusted2", "trusted3"]) {
            await rp14.nodes.register(name);
            await rp14.odao.members.bootstrap(name, { id: name, url: "node@home.com" });
        }
    });

    it("preserves exit penalties across repeated oDAO updates and emits the combined rate", async () => {
        const current = await (await load().ensure("1.4")).upgradeTo("current");
        for (let block = 1n; block <= 3n; block++) await applyOdao(current, block);
        assert.equal(await current.minipools.penaltyRate("pool"), parseEther("0.1"));

        const receipt = await applyExit(current);
        assert(receipt);
        const updated = receipt.logs.flatMap(log => {
            const event = current.contracts.rocketNetworkPenalties.interface.parseLog(log);
            return event?.name === "PenaltyUpdated" ? [event] : [];
        });
        assert.equal(updated.length, 1);
        assert.equal(updated[0].args.penalty, parseEther("0.10625"));

        await applyOdao(current, 4n);
        assert.equal(await current.minipools.penaltyRate("pool"), parseEther("0.20625"));
        await applyExit(current, parseEther("0.15"));
        await applyOdao(current, 5n);
        assert.deepEqual(await rates(current), {
            initialised: true,
            odao: parseEther("0.3"),
            exit: parseEther("0.015625"),
            raw: parseEther("0.315625"),
            effective: parseEther("0.315625"),
        });
    });

    it("preserves exit-first contributions through grace penalties and reprices only the oDAO component", async () => {
        const current = await (await load().ensure("1.4")).upgradeTo("current");
        await applyExit(current);
        for (let block = 1n; block <= 2n; block++) {
            await applyOdao(current, block);
            assert.equal(await current.minipools.penaltyRate("pool"), parseEther("0.00625"));
        }
        await applyOdao(current, 3n);
        await current.pdao.bootstrap.setSetting({
            contract: "rocketDAOProtocolSettingsNetwork",
            path: "network.penalty.per.rate",
            value: { type: "uint", value: parseEther("0.02") },
        });
        await applyOdao(current, 4n);
        assert.deepEqual(await rates(current), {
            initialised: true,
            odao: parseEther("0.04"),
            exit: parseEther("0.00625"),
            raw: parseEther("0.04625"),
            effective: parseEther("0.04625"),
        });
    });

    it("upgrades with uncapped legacy rates, counts and pending votes intact", async () => {
        const rp14 = await load().ensure("1.4");
        const oldPenalties = rp14.contracts.rocketNetworkPenalties;
        const address = rp14.minipools.get("pool").address;
        for (let block = 1n; block <= 3n; block++) await applyOdao(rp14, block);
        await submitMinipoolPenaltyScenario(rp14, { minipool: "pool", caller: "trusted1", block: 4n });
        await rp14.minipools.setMaximumPenaltyRate(parseEther("0.05"));
        assert.equal(await oldPenalties.version(), 2n);

        const current = await rp14.upgradeTo("current");
        const penalties = current.contracts.rocketNetworkPenalties;
        assert.equal(await penalties.version(), 3n);
        assert.notEqual(await penalties.getAddress(), await oldPenalties.getAddress());
        assert.equal(await penalties.getPenaltyCount(address), 3n);
        assert.equal(await penalties.getVoteCount(address, 4n), 1n);
        assert.equal(await penalties.getCurrentPenaltyRunningTotal(), 3n);
        assert.equal((await rates(current)).initialised, false);

        await applyExit(current);
        assert.equal((await rates(current)).raw, parseEther("0.10625"));
        assert.equal((await rates(current)).effective, parseEther("0.05"));
        await current.minipools.setMaximumPenaltyRate(parseEther("1"));
        assert.equal((await rates(current)).effective, parseEther("0.10625"));
        const trusted1 = await current.context.actor("trusted1");
        await expectRevert(() => penalties.connect(trusted1).submitPenalty(address, 4n), "Duplicate submission from node");
        await expectRevert(() => oldPenalties.connect(trusted1).submitPenalty(address, 5n));
        await submitMinipoolPenaltyScenario(current, { minipool: "pool", caller: "trusted2", block: 4n });
        assert.equal((await rates(current)).raw, parseEther("0.20625"));
        assert.equal(await penalties.getCurrentPenaltyRunningTotal(), 4n);
        const random = await current.context.actor("random");
        await expectRevert(() => penalties.connect(random).executeUpdatePenalty(address, 4n), "Penalty already applied");
    });

    it("allows only the active exit contract and registered targets without touching oDAO accounting", async () => {
        const current = await (await load().ensure("1.4")).upgradeTo("current");
        const penalties = current.contracts.rocketNetworkPenalties;
        const address = current.minipools.get("pool").address;
        const initial = await rates(current);
        const random = await current.context.actor("random");
        await expectRevert(() => penalties.connect(random).applyExitPenalty(address, 1n), "Invalid or outdated contract");
        await asNetworkContract(current, "rocketMegapoolManager", async signer => {
            await expectRevert(() => penalties.connect(signer).applyExitPenalty(address, 1n), "Invalid or outdated contract");
        });
        await asNetworkContract(current, "rocketNetworkExit", async signer => {
            await expectRevert(() => penalties.connect(signer).applyExitPenalty(ethers.ZeroAddress, 1n), "Invalid minipool");
        });
        assert.deepEqual(await rates(current), initial);
        const remaining = await penalties.getCurrentMaxPenalty();
        await applyExit(current);
        await applyExit(current);
        assert.equal((await rates(current)).exit, parseEther("0.0125"));
        assert.equal((await rates(current)).odao, 0n);
        assert.equal(await penalties.getPenaltyCount(address), 0n);
        assert.equal(await penalties.getCurrentPenaltyRunningTotal(), 0n);
        assert.equal(await penalties.getCurrentMaxPenalty(), remaining);
    });

    it("initialises a zero legacy rate only once, permits zero amounts and rounds each conversion down", async () => {
        const current = await (await load().ensure("1.4")).upgradeTo("current");
        await applyExit(current, 0n);
        assert.equal((await rates(current)).initialised, true);
        await applyExit(current, 1n);
        assert.equal((await rates(current)).raw, 0n);
        await applyExit(current, 17n);
        await applyExit(current, 17n);
        await applyExit(current, 0n);
        assert.deepEqual(await rates(current), { initialised: true, odao: 0n, exit: 2n, raw: 2n, effective: 2n });
    });

    it("retains both uncapped contributions when the maximum changes", async () => {
        const current = await (await load().ensure("1.4")).upgradeTo("current");
        for (let block = 1n; block <= 3n; block++) await applyOdao(current, block);
        await applyExit(current);
        await current.minipools.setMaximumPenaltyRate(parseEther("0.005"));
        await applyExit(current);
        assert.equal((await rates(current)).effective, parseEther("0.005"));
        assert.equal((await rates(current)).raw, parseEther("0.1125"));
        await current.minipools.setMaximumPenaltyRate(parseEther("1"));
        assert.equal((await rates(current)).effective, parseEther("0.1125"));
    });

    it("rolls back lazy initialisation and contributions when conversion fails, allowing retry", async () => {
        const current = await (await load().ensure("1.4")).upgradeTo("current");
        const address = current.minipools.get("pool").address;
        const initial = await rates(current);
        const code = await ethers.provider.getCode(address);
        // Return a zero node deposit balance to exercise the division-by-zero failure.
        await network.provider.send("hardhat_setCode", [address, "0x600060005260206000f3"]);
        try {
            await expectRevert(() => applyExit(current));
            assert.deepEqual(await rates(current), initial);
        } finally {
            await network.provider.send("hardhat_setCode", [address, code]);
        }
        await applyExit(current);
        assert.equal((await rates(current)).raw, parseEther("0.00625"));
    });
});
