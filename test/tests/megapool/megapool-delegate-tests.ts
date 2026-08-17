import assert from "assert";

import { before, describe, expectRevert, it, load } from "../../harness";
import { prepareMegapoolProtocol } from "./fixtures";

describe("RocketMegapool delegate upgrades", () => {
    before(async () => {
        const current = await prepareMegapoolProtocol();
        await current.megapools.deploy("node");
        await current.context.fixtures.megapoolUpgrade.deploy("delegate-upgrade");
    });

    it("rejects a random account upgrading a non-expired delegate", async () => {
        const current = await load().ensure("current");
        await current.context.fixtures.megapoolUpgrade.get("delegate-upgrade").upgradeDelegate();
        await expectRevert(
            async () => (await current.megapools.proxy("node", "random")).delegateUpgrade(),
            "Only the node operator can access this method",
        );
    });

    it("allows a random account to upgrade an expired delegate", async () => {
        const current = await load().ensure("current");
        const proxy = await current.megapools.proxy("node", "random");
        const oldDelegate = await proxy.getDelegate();
        await current.context.fixtures.megapoolUpgrade.get("delegate-upgrade").upgradeDelegate();
        const expiry = await current.contracts.rocketMegapoolFactory.getDelegateExpiry(oldDelegate);
        await current.time.advance(expiry - await current.time.latest() + 1n);
        await (await proxy.delegateUpgrade()).wait();
    });

    it("allows the node to upgrade a non-expired delegate", async () => {
        const current = await load().ensure("current");
        const fixture = current.context.fixtures.megapoolUpgrade.get("delegate-upgrade");
        await fixture.upgradeDelegate();
        const proxy = await current.megapools.proxy("node", "node");
        await (await proxy.delegateUpgrade()).wait();
        assert.equal((await proxy.getDelegate()).toLowerCase(), fixture.delegateAddress.toLowerCase());
    });

    it("allows the node to upgrade an expired delegate", async () => {
        const current = await load().ensure("current");
        const proxy = await current.megapools.proxy("node", "node");
        const oldDelegate = await proxy.getDelegate();
        await current.context.fixtures.megapoolUpgrade.get("delegate-upgrade").upgradeDelegate();
        const expiry = await current.contracts.rocketMegapoolFactory.getDelegateExpiry(oldDelegate);
        await current.time.advance(expiry - await current.time.latest() + 1n);
        await (await proxy.delegateUpgrade()).wait();
    });

    it("automatically adopts the latest delegate after expiry", async () => {
        const current = await load().ensure("current");
        const proxy = await current.megapools.proxy("node", "node");
        const oldDelegate = await proxy.getDelegate();
        const fixture = current.context.fixtures.megapoolUpgrade.get("delegate-upgrade");
        await fixture.upgradeDelegate();
        const expiry = await current.contracts.rocketMegapoolFactory.getDelegateExpiry(oldDelegate);
        await current.time.advance(expiry - await current.time.latest() + 1n);
        assert.equal((await proxy.getEffectiveDelegate()).toLowerCase(), fixture.delegateAddress.toLowerCase());
        await (await (await current.megapools.delegate("node", "node")).claim()).wait();
        assert.equal((await proxy.getDelegate()).toLowerCase(), fixture.delegateAddress.toLowerCase());
    });

    it("can opt into always using the latest delegate", async () => {
        const current = await load().ensure("current");
        const proxy = await current.megapools.proxy("node", "node");
        await (await proxy.setUseLatestDelegate(true)).wait();
        const fixture = current.context.fixtures.megapoolUpgrade.get("delegate-upgrade");
        await fixture.upgradeDelegate();
        assert.equal((await proxy.getEffectiveDelegate()).toLowerCase(), fixture.delegateAddress.toLowerCase());
        await (await proxy.setUseLatestDelegate(false)).wait();
        assert.equal((await proxy.getDelegate()).toLowerCase(), fixture.delegateAddress.toLowerCase());
    });

    it("rejects setting use-latest to its current value", async () => {
        const current = await load().ensure("current");
        const proxy = await current.megapools.proxy("node", "node");
        await (await proxy.setUseLatestDelegate(true)).wait();
        await expectRevert(() => proxy.setUseLatestDelegate(true), "Already set");
    });
});
