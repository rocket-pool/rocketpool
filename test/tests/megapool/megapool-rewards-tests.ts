import assert from "assert";

import { before, describe, it, load } from "../../harness";
import { challengeMegapoolValidatorsAndAssert } from "../../scenarios/megapool/challenge-validator";
import { distributeMegapoolRewardsAndAssert } from "../../scenarios/megapool/distribute-rewards";
import { finaliseMegapoolValidatorAndAssert } from "../../scenarios/megapool/finalise-validator";
import { notifyMegapoolExitAndAssert } from "../../scenarios/megapool/notify-exit";
import { currentEpoch } from "../../scenarios/megapool/proofs";
import { stakeMegapoolValidatorAndAssert } from "../../scenarios/megapool/stake-validator";
import { ETHER, prepareMegapoolProtocol } from "./fixtures";

const EXIT_EPOCHS = 114n;
const EPOCH_SECONDS = 32n * 12n;

function assertAlmostEqual(actual: bigint, expected: bigint, tolerance: bigint): void {
    const difference = actual > expected ? actual - expected : expected - actual;
    assert.equal(difference <= tolerance, true, `${actual} differs from ${expected} by ${difference}`);
}

async function exitValidator(validatorId: bigint): Promise<void> {
    const current = await load().ensure("current");
    await notifyMegapoolExitAndAssert(
        current,
        "node",
        validatorId,
        await currentEpoch(current) + EXIT_EPOCHS,
    );
    await current.time.advance(EXIT_EPOCHS * EPOCH_SECONDS);
    await finaliseMegapoolValidatorAndAssert(current, "node", validatorId, 32n * ETHER);
}

describe("RocketMegapool rewards", () => {
    before(async () => {
        await prepareMegapoolProtocol();
    });

    it("calculates rewards for an empty megapool", async () => {
        const current = await load().ensure("current");
        await current.megapools.deploy("node");
        const megapool = await current.megapools.delegate("node");
        assert.deepEqual(Array.from(await megapool.calculatePendingRewards()), [0n, 0n, 0n, 0n]);
        await current.megapools.sendRewards("node", "rewards", ETHER);
        assert.deepEqual(Array.from(await megapool.calculatePendingRewards()), [ETHER, 0n, 0n, 0n]);
    });

    it("calculates time-weighted rewards when the capital ratio changes", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await current.depositPool.fund("ratio-depositor", 86n * ETHER);
        for (let validatorId = 0n; validatorId < 2n; validatorId++) {
            await current.megapools.deposit("node");
            await stakeMegapoolValidatorAndAssert(current, "node", validatorId);
        }
        await challengeMegapoolValidatorsAndAssert(current, "node", [0n], "trusted1");

        const megapool = await current.megapools.delegate("node");
        const nodeAddress = await current.nodes.address("node");
        const lastDistributionTime = await megapool.getLastDistributionTime();
        await current.time.advance(lastDistributionTime + 99n - await current.time.latest());
        assert.equal(
            await current.contracts.rocketNetworkRevenues.getNodeCapitalRatio(nodeAddress),
            125_000_000_000_000_000n,
        );

        await current.megapools.deposit("node", { bond: 2n * ETHER });
        await stakeMegapoolValidatorAndAssert(current, "node", 2n);
        await current.time.advance(lastDistributionTime + 201n - await current.time.latest());
        await current.megapools.sendRewards("node", "rewards", ETHER);
        assert.equal(await megapool.getPendingRewards(), ETHER);
        assert.equal(
            await current.contracts.rocketNetworkRevenues.getNodeCapitalRatio(nodeAddress),
            104_160_000_000_000_000n,
        );
        assert.equal(
            await current.contracts.rocketNetworkRevenues.getNodeAverageCapitalRatioSince(
                nodeAddress,
                lastDistributionTime,
            ),
            114_580_000_000_000_000n,
        );

        const split = await megapool.calculatePendingRewards();
        const tolerance = 100_000_000_000_000n;
        assertAlmostEqual(split[0], 158_861_000_000_000_000n, tolerance);
        assertAlmostEqual(split[1], 79_686_900_000_000_000n, tolerance);
        assert.equal(split[2], 0n);
        assertAlmostEqual(split[3], 761_452_100_000_000_000n, tolerance);
    });

    it("resets the capital-ratio history after all validators exit", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await current.depositPool.fund("reset-ratio-depositor", 86n * ETHER);
        await current.megapools.deposit("node");
        await current.megapools.deposit("node");
        await current.megapools.deposit("node", { bond: 2n * ETHER });
        for (let validatorId = 0n; validatorId < 3n; validatorId++) {
            await stakeMegapoolValidatorAndAssert(current, "node", validatorId);
        }
        const megapool = await current.megapools.delegate("node");
        const nodeAddress = await current.nodes.address("node");
        const revenues = current.contracts.rocketNetworkRevenues;
        assert.equal(
            await revenues.getNodeAverageCapitalRatioSince(nodeAddress, await megapool.getLastDistributionTime()),
            104_160_000_000_000_000n,
        );

        await exitValidator(0n);
        assert.equal(
            await revenues.getNodeAverageCapitalRatioSince(nodeAddress, await megapool.getLastDistributionTime()),
            125_000_000_000_000_000n,
        );
        await exitValidator(1n);
        await exitValidator(2n);
        assert.equal(
            await revenues.getNodeAverageCapitalRatioSince(nodeAddress, await megapool.getLastDistributionTime()),
            125_000_000_000_000_000n,
        );

        await current.megapools.deposit("node");
        await stakeMegapoolValidatorAndAssert(current, "node", 3n);
        const lastDistributionTime = await megapool.getLastDistributionTime();
        assert.equal(
            await revenues.getNodeAverageCapitalRatioSince(nodeAddress, lastDistributionTime),
            125_000_000_000_000_000n,
        );
        assert.equal(lastDistributionTime, await current.time.latest());
    });

    it("distributes node, voter, protocol, and rETH shares", async () => {
        const current = await load().ensure("current");
        await current.depositPool.fund("depositor", 28n * ETHER);
        await current.megapools.deposit("node");
        await stakeMegapoolValidatorAndAssert(current, "node", 0n);
        await current.megapools.sendRewards("node", "rewards", ETHER);
        assert.deepEqual(
            Array.from(await (await current.megapools.delegate("node")).calculatePendingRewards()),
            [168_750_000_000_000_000n, 78_750_000_000_000_000n, 0n, 752_500_000_000_000_000n],
        );
        await distributeMegapoolRewardsAndAssert(current, "node");
    });

    it("routes the configured protocol DAO share to its vault", async () => {
        const current = await load().ensure("current");
        await current.depositPool.fund("depositor", 28n * ETHER);
        await current.megapools.deposit("node");
        await stakeMegapoolValidatorAndAssert(current, "node", 0n);
        await current.pdao.settings.network.setProtocolDAOShare(ETHER / 100n);
        await current.megapools.sendRewards("node", "initial-rewards", ETHER);
        await current.megapools.distribute("node");
        await current.megapools.sendRewards("node", "rewards", ETHER);
        assert.deepEqual(
            Array.from(await (await current.megapools.delegate("node")).calculatePendingRewards()),
            [168_750_000_000_000_000n, 78_750_000_000_000_000n, 8_750_000_000_000_000n, 743_750_000_000_000_000n],
        );
        const before = await current.contracts.rocketVault.balanceOf("rocketClaimDAO");
        await distributeMegapoolRewardsAndAssert(current, "node");
        assert.equal(
            await current.contracts.rocketVault.balanceOf("rocketClaimDAO") - before,
            8_750_000_000_000_000n,
        );
    });
});
