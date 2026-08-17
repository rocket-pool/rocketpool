import assert from "assert";
import { parseUnits } from "ethers";

import type { ProtocolView } from "../../harness";

const ETHER = 10n ** 18n;

export function dailyInflationRate(yearlyTarget: number): bigint {
    if (!Number.isFinite(yearlyTarget) || yearlyTarget < 0) {
        throw new Error("Yearly inflation target must be a non-negative finite number");
    }
    return parseUnits(((1 + yearlyTarget) ** (1 / 365)).toFixed(18), 18);
}

export async function setRplInflationConfigAndAssert(
    protocol: ProtocolView,
    options: { startTime: bigint; yearlyTarget: number },
): Promise<void> {
    const rate = dailyInflationRate(options.yearlyTarget);
    await protocol.pdao.settings.inflation.setStartTime(options.startTime);
    await protocol.pdao.settings.inflation.setIntervalRate(rate);

    const rpl = protocol.contracts.rocketTokenRPL;
    assert.equal(await rpl.getInflationIntervalStartTime(), options.startTime);
    assert.equal(await rpl.getInflationIntervalRate(), rate);
}

interface InflationData {
    totalSupply: bigint;
    intervalsPassed: bigint;
    intervalRate: bigint;
    calcTime: bigint;
    intervalTime: bigint;
    vaultBalance: bigint;
    rewardsPoolBalance: bigint;
}

async function inflationData(protocol: ProtocolView): Promise<InflationData> {
    const rpl = protocol.contracts.rocketTokenRPL;
    const vault = protocol.contracts.rocketVault;
    const [
        totalSupply,
        intervalsPassed,
        intervalRate,
        calcTime,
        intervalTime,
        vaultBalance,
        rewardsPoolBalance,
    ] = await Promise.all([
        rpl.totalSupply(),
        rpl.getInflationIntervalsPassed(),
        rpl.getInflationIntervalRate(),
        rpl.getInflationCalcTime(),
        rpl.getInflationIntervalTime(),
        rpl.balanceOf(await vault.getAddress()),
        vault.balanceOfToken("rocketRewardsPool", await rpl.getAddress()),
    ]);
    return {
        totalSupply,
        intervalsPassed,
        intervalRate,
        calcTime,
        intervalTime,
        vaultBalance,
        rewardsPoolBalance,
    };
}

export async function claimRplInflationAndAssert(
    protocol: ProtocolView,
    options: {
        caller: string;
        claimTime: bigint;
        expectedWholeSupply?: bigint;
    },
): Promise<bigint> {
    const now = await protocol.time.latest();
    if (options.claimTime < now) {
        throw new Error(`RPL inflation claim time ${options.claimTime} is before current time ${now}`);
    }
    if (options.claimTime > now) await protocol.time.advance(options.claimTime - now);

    const before = await inflationData(protocol);
    let expectedSupply = before.totalSupply;
    for (let interval = 0n; interval < before.intervalsPassed; interval += 1n) {
        expectedSupply = expectedSupply * before.intervalRate / ETHER;
    }
    const expectedMint = expectedSupply - before.totalSupply;

    await protocol.tokens.mintRplInflation(options.caller);

    const after = await inflationData(protocol);
    assert.equal(after.totalSupply, before.totalSupply + expectedMint, "RPL supply delta was incorrect");
    assert.equal(after.vaultBalance, before.vaultBalance + expectedMint, "Vault RPL balance delta was incorrect");
    assert.equal(
        after.rewardsPoolBalance,
        before.rewardsPoolBalance + expectedMint,
        "Rewards-pool vault balance delta was incorrect",
    );
    assert.equal(after.vaultBalance, after.rewardsPoolBalance, "Vault RPL accounting did not balance");
    const expectedCalcTime = before.intervalsPassed > 0n
        ? before.calcTime + before.intervalTime * before.intervalsPassed
        : before.calcTime;
    assert.equal(after.calcTime, expectedCalcTime, "Inflation calculation time was incorrect");
    if (options.expectedWholeSupply !== undefined) {
        assert.equal(after.totalSupply / ETHER, options.expectedWholeSupply);
    }
    return expectedMint;
}
