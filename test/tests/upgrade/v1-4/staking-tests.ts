import assert from "assert";
import { parseEther } from "ethers";

import { ethers } from "../../../../test-old/_utils/hardhat-runtime";
import { before, describe, expectRevert, it, load } from "../../../harness";
import { depositMegapoolValidatorScenario } from "../../../scenarios/megapool/deposit-validator";
import { submitPricesScenario } from "../../../scenarios/network/submit-prices";
import { unstakeLegacyRplAndAssert, withdrawRplAndAssert } from "../../../scenarios/node/rpl-staking";

function sqrt(value: bigint): bigint {
    if (value < 2n) return value;
    let x = value;
    let y = (x + 1n) / 2n;
    while (y < x) {
        x = y;
        y = (x + value / x) / 2n;
    }
    return x;
}

describe("Rocket Pool 1.4 legacy staking upgrade", () => {
    it("withdraws RPL staked before the upgrade", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.tokens.mintRpl("node", parseEther("100"));
        await rp131.nodes.stakeRpl("node", parseEther("100"));
        const rp14 = await rp131.upgradeTo("1.4");
        await unstakeLegacyRplAndAssert(rp14, "node", parseEther("100"));
        await rp14.time.advance(28n * 24n * 60n * 60n + 1n);
        await withdrawRplAndAssert(rp14, "node");
    });

    it("separates RPL staked before and after the upgrade", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.tokens.mintRpl("node", parseEther("300"));
        await rp131.nodes.stakeRpl("node", parseEther("100"));
        const rp14 = await rp131.upgradeTo("1.4");
        await rp14.nodes.stakeRpl("node", parseEther("200"));
        assert.equal(await rp14.nodes.legacyStakedRpl("node"), parseEther("100"));
        assert.equal(await rp14.nodes.megapoolStakedRpl("node"), parseEther("200"));
        assert.equal(await rp14.nodes.stakedRpl("node"), parseEther("300"));
        const block = await ethers.provider.getBlockNumber();
        assert.equal(await rp14.contracts.rocketNetworkVoting.getVotingPower(await rp14.nodes.address("node"), block), 0n);
    });

    it("calculates voting power from legacy and megapool validators", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.tokens.mintRpl("node", parseEther("10000"));
        await rp131.nodes.stakeRpl("node", parseEther("5000"));
        await rp131.minipools.create("pool", { node: "node", bond: parseEther("16") });
        const rp14 = await rp131.upgradeTo("1.4");
        await rp14.depositPool.fund("depositor", parseEther("16"));
        await depositMegapoolValidatorScenario(rp14, "node", { expectedStatus: "queue" });
        await rp14.nodes.stakeRpl("node", parseEther("5000"));
        await rp14.time.advanceMinipoolScrubPeriod();
        await rp14.minipools.stake("pool");
        const block = await ethers.provider.getBlockNumber();
        const votingPower = await rp14.contracts.rocketNetworkVoting.getVotingPower(
            await rp14.nodes.address("node"),
            block,
        );
        assert.equal(votingPower, sqrt(parseEther("3000") * parseEther("1")));
    });

    it("unstakes legacy RPL down to 15% of borrowed ETH", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        for (const [name, id] of [["trusted1", "saas_1"], ["trusted2", "saas_2"], ["trusted3", "saas_3"]] as const) {
            await rp131.nodes.register(name);
            await rp131.odao.members.bootstrap(name, { id, url: "node@home.com" });
        }
        const block = BigInt(await ethers.provider.getBlockNumber());
        for (const caller of ["trusted1", "trusted2", "trusted3"]) {
            await submitPricesScenario(rp131, {
                caller,
                block,
                slotTimestamp: 1_600_000_000n,
                rplPrice: parseEther("0.1"),
            });
        }
        await rp131.tokens.mintRpl("node", parseEther("1000"));
        await rp131.nodes.stakeRpl("node", parseEther("1000"));
        await rp131.minipools.create("pool", { node: "node", bond: parseEther("8") });
        await rp131.depositPool.fund("depositor", parseEther("24"));
        assert.equal((await rp131.minipools.details("pool")).status, 1);
        const rp14 = await rp131.upgradeTo("1.4");
        await rp14.pdao.settings.nodes.setMinimumLegacyRplStake(parseEther("0.15"));
        assert.equal(await rp14.nodes.minimumLegacyRplStake("node"), parseEther("36"));
        await expectRevert(() => rp14.nodes.unstakeLegacyRpl("node", parseEther("965")), "Insufficient legacy staked RPL");
        await unstakeLegacyRplAndAssert(rp14, "node", parseEther("964"));
        await expectRevert(() => rp14.nodes.unstakeLegacyRpl("node", 1n), "Insufficient legacy staked RPL");
    });
});
