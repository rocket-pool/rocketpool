import assert from "assert";
import { parseEther, ZeroAddress } from "ethers";

import { before, describe, it, load, validateRelease } from "../harness";

describe("version-aware protocol harness", () => {
    before(async () => {
        validateRelease("1.3.1");
        validateRelease("1.4");

        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("alice");
        await rp131.nodes.stakeMinimumRpl("alice", {
            minipools: 1,
            bond: parseEther("8"),
        });
        await rp131.depositPool.fund("depositor", parseEther("24"));
        await rp131.minipools.create("pool", {
            node: "alice",
            bond: parseEther("8"),
        });
        assert((await rp131.odao.settings.minipools.getScrubPeriod()) > 0n);
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.upgradeTo("1.4");
    });

    it("returns typed 1.4 bindings and stakes a pre-upgrade minipool", async () => {
        const rp14 = await load().ensure("1.4");
        assert.equal(rp14.release, "1.4");
        assert.equal(rp14.minipools.get("pool").provenance, "lifecycle");
        const delegate = await rp14.minipools.delegate("pool");
        const historicalDelegate = load().historical.get("1.3.1", "rocketMinipoolDelegate");
        assert.equal(delegate.version, 3);
        assert.equal(delegate.storedAddress, await historicalDelegate.getAddress());
        assert.equal(delegate.previousAddress, ZeroAddress);
        assert.equal(delegate.effectiveAddress, delegate.storedAddress);
        assert.equal(delegate.useLatest, false);
        await rp14.minipools.stake("pool");
    });

    it("restores the suite baseline before every test", async () => {
        const rp14 = await load().ensure("1.4");
        const pool = rp14.minipools.get("pool");
        const delegate = load().historical.get("1.3.1", "rocketMinipoolDelegate").attach(pool.address);
        assert.equal(Number(await (delegate as any).getStatus()), 1);
        await rp14.minipools.stake("pool");
    });

    it("invalidates a release view after a test-local upgrade", async () => {
        const rp14 = await load().ensure("1.4");
        await rp14.upgradeTo("current");
        assert.throws(() => rp14.minipools.get("pool"), /Stale Rocket Pool 1\.4 view/);
    });

    describe("current", () => {
        before(async () => {
            const rp14 = await load().ensure("1.4");
            await rp14.upgradeTo("current");
        });

        it("inherits the legacy entity and current release", async () => {
            const current = await load().ensure("current");
            assert.equal(current.release, "current");
            assert.equal(current.minipools.get("pool").createdRelease, "1.3.1");
            const delegate = await current.minipools.delegate("pool");
            const historicalDelegate = load().historical.get("1.3.1", "rocketMinipoolDelegate");
            assert.equal(delegate.version, 3);
            assert.equal(delegate.storedAddress, await historicalDelegate.getAddress());
            assert.equal(delegate.previousAddress, ZeroAddress);
            assert.equal(delegate.effectiveAddress, delegate.storedAddress);
            assert.equal(delegate.useLatest, false);
            await current.minipools.stake("pool");
        });

    });
});

describe("independent root harness scope", () => {
    before(async () => {
        await load().ensure("1.3.1");
    });

    it("does not inherit another root suite deployment", async () => {
        const rp131 = await load().ensure("1.3.1");
        assert.equal(rp131.release, "1.3.1");
        assert.throws(() => rp131.minipools.get("pool"), /Unknown minipool/);
    });
});
