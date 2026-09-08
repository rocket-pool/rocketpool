import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";

const BOND = parseEther("16");

describe("RocketMinipool delegate compatibility", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.nodes.setWithdrawalAddress("node", "nodeWithdrawal", { confirm: true });
        await rp131.nodes.stakeMinimumRpl("node", { minipools: 1, bond: BOND });
        await rp131.depositPool.fund("depositor", BOND);
        await rp131.minipools.create("pool", { node: "node", bond: BOND });
        await rp131.upgradeTo("current");
    });

    it("upgrades and rolls back the stored delegate", async () => {
        const current = await load().ensure("current");
        const original = await current.minipools.delegate("pool");
        assert.equal(original.version, 3);
        await current.minipools.delegateUpgrade("pool");
        const upgraded = await current.minipools.delegate("pool");
        assert.equal(upgraded.version, 4);
        assert.notEqual(upgraded.storedAddress, original.storedAddress);
        assert.equal(upgraded.previousAddress, original.storedAddress);
        assert.equal(upgraded.effectiveAddress, upgraded.storedAddress);

        await current.minipools.delegateRollback("pool");
        const rolledBack = await current.minipools.delegate("pool");
        assert.equal(rolledBack.version, 3);
        assert.equal(rolledBack.storedAddress, original.storedAddress);
        assert.equal(rolledBack.effectiveAddress, original.effectiveAddress);
    });

    it("uses the latest network delegate without changing the stored delegate", async () => {
        const current = await load().ensure("current");
        const original = await current.minipools.delegate("pool");
        await current.minipools.setUseLatestDelegate("pool", true);
        const latest = await current.minipools.delegate("pool");
        assert.equal(latest.version, 4);
        assert.equal(latest.useLatest, true);
        assert.equal(latest.storedAddress, original.storedAddress);
        assert.notEqual(latest.effectiveAddress, original.effectiveAddress);
    });

    it("rejects delegate controls from a random address", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.minipools.delegateUpgrade("pool", { caller: "random" }),
            "Only the node operator can access this method",
        );
        await current.minipools.delegateUpgrade("pool");
        await expectRevert(
            () => current.minipools.delegateRollback("pool", { caller: "random" }),
            "Only the node operator can access this method",
        );
        await expectRevert(
            () => current.minipools.setUseLatestDelegate("pool", true, { caller: "random" }),
            "Only the node operator can access this method",
        );
    });
});

describe("RocketMinipool invalid latest delegate", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.nodes.stakeMinimumRpl("node", { minipools: 1, bond: BOND });
        await rp131.depositPool.fund("depositor", BOND);
        await rp131.minipools.create("pool", { node: "node", bond: BOND });
        await rp131.odao.bootstrap.upgrade(
            "upgradeContract",
            "rocketMinipoolDelegate",
            "[]",
            await rp131.nodes.address("badDelegate"),
        );
        await rp131.minipools.setUseLatestDelegate("pool", true);
    });

    it("rejects delegate calls when the latest delegate is not a contract", async () => {
        const rp131 = await load().ensure("1.3.1");
        await expectRevert(
            () => rp131.minipools.details("pool"),
            "Delegate contract does not exist",
        );
        await rp131.minipools.setUseLatestDelegate("pool", false);
    });
});
