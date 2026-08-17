import assert from "assert";

import type { ProtocolView } from "../../harness";
import { setRplInflationConfigAndAssert } from "../token/rpl-inflation";

export async function setRewardClaimIntervalAndAssert(
    protocol: ProtocolView,
    seconds: bigint,
): Promise<void> {
    await protocol.pdao.settings.rewards.setClaimInterval(seconds);
    assert.equal(await protocol.pdao.settings.rewards.claimInterval(), seconds);
}

export async function setRewardClaimersAndAssert(
    protocol: ProtocolView,
    claimers: { trustedNode: bigint; protocol: bigint; node: bigint },
): Promise<void> {
    await protocol.pdao.settings.rewards.setClaimers(claimers);
    assert.deepEqual(await protocol.pdao.settings.rewards.claimers(), claimers);
}

export async function configureRewardsAndAssert(
    protocol: ProtocolView,
    options: {
        inflationStart: bigint;
        yearlyInflationTarget: number;
        claimInterval: bigint;
        claimers: { trustedNode: bigint; protocol: bigint; node: bigint };
    },
): Promise<void> {
    await setRplInflationConfigAndAssert(protocol, {
        startTime: options.inflationStart,
        yearlyTarget: options.yearlyInflationTarget,
    });
    await setRewardClaimIntervalAndAssert(protocol, options.claimInterval);
    await setRewardClaimersAndAssert(protocol, options.claimers);
}
