import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolView } from "../../harness";
import type { BalanceSubmission } from "../../harness/protocol/domains/network";

export async function submitBalancesScenario(
    protocol: ProtocolView,
    options: BalanceSubmission,
): Promise<void> {
    const caller = await protocol.nodes.address(options.caller);
    const nodeKey = ethers.solidityPackedKeccak256(
        ["string", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],
        ["network.balances.submitted.node", caller, options.block, options.slotTimestamp,
            options.totalEth, options.stakingEth, options.rethSupply],
    );
    const countKey = ethers.solidityPackedKeccak256(
        ["string", "uint256", "uint256", "uint256", "uint256", "uint256"],
        ["network.balances.submitted.count", options.block, options.slotTimestamp,
            options.totalEth, options.stakingEth, options.rethSupply],
    );
    const [submittedBefore, countBefore, memberCount, threshold, balancesBefore] = await Promise.all([
        protocol.contracts.rocketStorage.getBool(nodeKey),
        protocol.contracts.rocketStorage.getUint(countKey),
        protocol.contracts.rocketDAONodeTrusted.getMemberCount(),
        protocol.contracts.rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold(),
        protocol.network.balances.details(),
    ]);

    assert.equal(submittedBefore, false);
    await protocol.network.balances.submit(options);

    const [submittedAfter, countAfter, balancesAfter] = await Promise.all([
        protocol.contracts.rocketStorage.getBool(nodeKey),
        protocol.contracts.rocketStorage.getUint(countKey),
        protocol.network.balances.details(),
    ]);
    assert.equal(submittedAfter, true);
    assert.equal(countAfter, countBefore + 1n);

    if (balancesBefore.block === options.block) return;
    const reachedConsensus = 10n ** 18n * countAfter / memberCount >= threshold;
    if (reachedConsensus) {
        assert.deepEqual(balancesAfter, {
            block: options.block,
            timestamp: balancesAfter.timestamp,
            totalEth: options.totalEth,
            stakingEth: options.stakingEth,
            rethSupply: options.rethSupply,
        });
        assert(balancesAfter.timestamp > balancesBefore.timestamp);
    } else {
        assert.deepEqual(balancesAfter, balancesBefore);
    }
}

export async function executeBalancesScenario(
    protocol: ProtocolView,
    options: BalanceSubmission,
): Promise<void> {
    const before = await protocol.network.balances.details();
    await protocol.network.balances.execute(options);
    const after = await protocol.network.balances.details();
    assert.deepEqual(after, {
        block: options.block,
        timestamp: after.timestamp,
        totalEth: options.totalEth,
        stakingEth: options.stakingEth,
        rethSupply: options.rethSupply,
    });
    assert(after.timestamp > before.timestamp);
}
