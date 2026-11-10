import assert from "node:assert/strict";
import { id, parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../../harness";
import { RocketStorage__factory, RocketDAOProtocolSettingsMegapool__factory, RocketDAOProtocolSettingsSecurity__factory } from "../../../harness/bindings/current";

describe("current protocol upgrade", () => {
    before(async () => {
        const rp14 = await load().ensure("1.4");
        await rp14.upgradeTo("current");
    });

    it("initializes proofless defaults and council permissions on a fresh deployment", async () => {
        const current = await load().ensure("current");
        const guardian = await current.context.guardian();
        const storage = await new RocketStorage__factory(guardian).deploy();
        await storage.waitForDeployment();
        const settings = await new RocketDAOProtocolSettingsMegapool__factory(guardian).deploy(String(storage.target));
        await settings.waitForDeployment();
        const security = await new RocketDAOProtocolSettingsSecurity__factory(guardian).deploy(String(storage.target));
        await security.waitForDeployment();
        assert.equal(await settings.getStakeWithoutProofEnabled(), true);
        assert.equal(await settings.getPrestakeChallengePeriod(), 12n * 60n * 60n);
        assert.equal(await storage.getBool(id("dao.security.allowed.settingmegapoolmegapool.stake.without.proof.enabled")), true);
    });

    it("upgrades node settings and enforces the 1.1–4 ETH reduced-bond guardrail", async () => {
        const current = await load().ensure("current");
        const settings = current.contracts.rocketDAOProtocolSettingsNode;
        const address = await settings.getAddress();
        assert.equal(await settings.version(), 6n);
        assert.notEqual(address, await load().historical.get("1.4", "rocketDAOProtocolSettingsNode").getAddress());
        assert.equal(await current.contracts.rocketUpgradeOneDotFive.addresses(11), address);
        assert.equal(await current.contracts.rocketUpgradeOneDotFive.abis(11), await current.contracts.rocketStorage.getString(id("contract.abirocketDAOProtocolSettingsNode")));
        // The upgrade changes the guardrail, not the configured bond value.
        assert.equal(await settings.getReducedBond(), parseEther("4"));
        for (const value of ["1", "1.099", "4.001"]) {
            await expectRevert(() => current.pdao.settings.nodes.setReducedBond(parseEther(value)), "Value must be >= 1.1 ETH & <= 4 ETH");
        }
        for (const value of ["1.1", "4"]) {
            await current.pdao.settings.nodes.setReducedBond(parseEther(value));
            assert.equal(await settings.getReducedBond(), parseEther(value));
        }
        await expectRevert(() => current.pdao.settings.nodes.setReducedBond(parseEther("1.1") + 1n), "Value must be divisible by milliwei");
    });

    it("updates the protocol settings and version", async () => {
        const current = await load().ensure("current");
        const networkSettings = current.contracts.rocketDAOProtocolSettingsNetwork;
        const megapoolSettings = current.contracts.rocketDAOProtocolSettingsMegapool;

        // RPIP-71 settings
        assert.equal(await networkSettings.getDepositPoolCollateralTarget(), parseEther("0.01"));
        assert.equal(await networkSettings.getMegapoolExitPhase(), false);
        assert.equal(await networkSettings.getStakingDelay(), 28n * 24n * 60n * 60n);
        assert.equal(await networkSettings.getTournamentSize(), 4n);

        // RPIP-44 settings
        assert.equal(await megapoolSettings.getExitDeficit(), parseEther("0.2"));

        // RPIP-79 settings
        assert.equal(await megapoolSettings.getStakeWithoutProofEnabled(), true);
        assert.equal(await megapoolSettings.getPrestakeChallengePeriod(), 12n * 60n * 60n);
        assert.equal(await current.contracts.rocketStorage.getBool(id("dao.security.allowed.settingmegapoolmegapool.stake.without.proof.enabled")), true);

        // Protocol version string
        assert.equal(
            await current.contracts.rocketStorage.getString(id("protocol.version")),
            "1.5",
        );
    });
});

describe("v1.5 node-settings upgrade", () => {
    it("preserves an existing reduced-bond setting", async () => {
        const old = await load().ensure("1.4");
        await old.pdao.settings.nodes.setReducedBond(parseEther("2"));
        const current = await old.upgradeTo("current");
        assert.equal(await current.contracts.rocketDAOProtocolSettingsNode.version(), 6n);
        assert.equal(await current.contracts.rocketDAOProtocolSettingsNode.getReducedBond(), parseEther("2"));
    });
});
