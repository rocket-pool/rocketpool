import assert from "assert";
import { parseEther } from "ethers";

import { ethers, time } from "../../../../test-old/_utils/hardhat-runtime";
import { before, describe, it, load } from "../../../harness";
import { depositMegapoolValidatorScenario } from "../../../scenarios/megapool/deposit-validator";

describe("Rocket Pool 1.4 upgrade misc", () => {
    it("updates the expected settings and protocol version", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.pdao.settings.nodes.setDepositEnabled(false);
        const rp14 = await rp131.upgradeTo("1.4");
        const upgradeTime = BigInt(await time.latest());
        const c = rp14.contracts;

        assert.equal(await c.rocketNetworkRevenues.getCurrentNodeShare(), parseEther("0.05"));
        assert.equal(await c.rocketNetworkRevenues.getCurrentProtocolDAOShare(), 0n);
        assert.equal(await c.rocketNetworkRevenues.getCurrentVoterShare(), parseEther("0.09"));
        assert.equal(await c.rocketDAOProtocolSettingsNetwork.getNodeShare(), parseEther("0.05"));
        assert.equal(await c.rocketDAOProtocolSettingsNetwork.getVoterShare(), parseEther("0.09"));
        assert.equal(await c.rocketDAOProtocolSettingsNetwork.getProtocolDAOShare(), 0n);
        assert.equal(await c.rocketDAOProtocolSettingsNetwork.getMaxNodeShareSecurityCouncilAdder(), parseEther("0.01"));
        assert.equal(await c.rocketDAOProtocolSettingsNetwork.getNodeShareSecurityCouncilAdder(), 0n);
        assert.deepEqual(await c.rocketDAOProtocolSettingsNetwork.getAllowListedControllers(), []);
        assert.equal(await c.rocketDAOProtocolSettingsMinipool.getMaximumPenaltyCount(), 2500n);
        assert.equal(await c.rocketDAOProtocolSettingsNetwork.getMaxRethDelta(), parseEther("0.02"));
        assert.equal(await c.rocketDAOProtocolSettingsMegapool.getMaximumEthPenalty(), parseEther("612"));
        assert.equal(await c.rocketDAOProtocolSettingsNode.getReducedBond(), parseEther("4"));
        assert.deepEqual(await c.rocketDAOProtocolSettingsNode.getBaseBondArray(), [parseEther("4"), parseEther("8")]);
        assert.equal(await c.rocketDAOProtocolSettingsNode.getUnstakingPeriod(), 28n * 24n * 60n * 60n);
        assert.equal(await c.rocketDAOProtocolSettingsDeposit.getExpressQueueRate(), 4n);
        assert.equal(await c.rocketDAOProtocolSettingsDeposit.getExpressQueueTicketsBaseProvision(), 0n);
        assert.equal(await c.rocketDAOProtocolSettingsMegapool.getTimeBeforeDissolve(), 28n * 24n * 60n * 60n);
        assert.equal(await c.rocketDAOProtocolSettingsSecurity.getUpgradeDelay(), 7n * 24n * 60n * 60n);
        assert.equal(await c.rocketDAOProtocolSettingsSecurity.getUpgradeVetoQuorum(), parseEther("0.33"));
        assert.equal(await c.rocketDAOProtocolSettingsMegapool.getNotifyThreshold(), 112n);
        assert.equal(await c.rocketDAOProtocolSettingsMegapool.getLateNotifyFine(), parseEther("0.05"));
        assert.equal(await c.rocketDAOProtocolSettingsMegapool.getUserDistributeDelay(), 1575n);
        assert.equal(await c.rocketDAOProtocolSettingsMegapool.getUserDistributeDelayWithShortfall(), 6750n);
        assert.equal(await c.rocketDAOProtocolSettingsProposals.getProposalQuorum(), parseEther("0.15"));
        assert.equal(await c.rocketDAOProtocolSettingsProposals.getProposalVetoQuorum(), parseEther("0.20"));
        assert.equal(
            await c.rocketStorage.getString(ethers.solidityPackedKeccak256(["string"], ["protocol.version"])),
            "1.4",
        );
        assert.deepEqual(await c.rocketNetworkRevenues.calculateSplit(upgradeTime), [
            parseEther("0.05"),
            parseEther("0.09"),
            0n,
            parseEther("0.86"),
        ]);
        assert.equal(await c.rocketDAOProtocolSettingsNode.getDepositEnabled(), true);
    });

    describe("node registered before upgrade", () => {
        before(async () => {
            const rp131 = await load().ensure("1.3.1");
            await rp131.nodes.register("node");
            await rp131.depositPool.fund("depositor", parseEther("28"));
            await rp131.upgradeTo("1.4");
        });

        it("creates a megapool and deposits a validator after upgrade", async () => {
            const rp14 = await load().ensure("1.4");
            await rp14.megapools.deploy("node");
            await depositMegapoolValidatorScenario(rp14, "node", { expectedStatus: "prestake" });
            assert.deepEqual(await rp14.megapools.validator("node", 0n), {
                staked: false,
                inQueue: false,
                inPrestake: true,
            });
        });
    });
});
