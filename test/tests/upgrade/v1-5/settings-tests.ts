import assert from "node:assert/strict";
import { id, parseEther } from "ethers";

import { before, describe, it, load } from "../../../harness";

describe("current protocol upgrade", () => {
    before(async () => {
        const rp14 = await load().ensure("1.4");
        await rp14.upgradeTo("current");
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

        // Protocol version string
        assert.equal(
            await current.contracts.rocketStorage.getString(id("protocol.version")),
            "1.5",
        );
    });
});
