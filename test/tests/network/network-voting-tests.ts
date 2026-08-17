import assert from "assert";
import { parseEther } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import { before, describe, it, load } from "../../harness";
import { depositMegapoolValidatorScenario } from "../../scenarios/megapool/deposit-validator";

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

describe("RocketNetworkVoting", () => {
    before(async () => {
        const current = await load().ensure("current");
        await current.nodes.register("node");
        await current.tokens.mintRpl("node", parseEther("1200"));
        await current.nodes.stakeRpl("node", parseEther("1200"));
        await current.depositPool.fund("depositor", parseEther("320"));
    });

    it("snapshots voting power as megapool bonded ETH changes", async () => {
        const current = await load().ensure("current");

        await depositMegapoolValidatorScenario(current, "node", { bond: parseEther("4") });
        const blockBefore = BigInt(await ethers.provider.getBlockNumber());

        await depositMegapoolValidatorScenario(current, "node", { bond: parseEther("4") });
        const blockAfter = BigInt(await ethers.provider.getBlockNumber());

        const [votingPowerBefore, votingPowerAfter] = await Promise.all([
            current.network.voting.power("node", blockBefore),
            current.network.voting.power("node", blockAfter),
        ]);
        assert.equal(votingPowerBefore, sqrt(parseEther("600") * parseEther("1")));
        assert.equal(votingPowerAfter, sqrt(parseEther("1200") * parseEther("1")));
    });
});
