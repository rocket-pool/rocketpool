import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolView } from "../../harness";

export async function submitPricesScenario(
    protocol: ProtocolView,
    options: { caller: string; block: bigint; slotTimestamp: bigint; rplPrice: bigint },
): Promise<void> {
    const caller = await protocol.nodes.address(options.caller);
    const nodeKey = ethers.solidityPackedKeccak256(
        ["string", "address", "uint256", "uint256", "uint256"],
        ["network.prices.submitted.node.key", caller, options.block, options.slotTimestamp, options.rplPrice],
    );
    const countKey = ethers.solidityPackedKeccak256(
        ["string", "uint256", "uint256", "uint256"],
        ["network.prices.submitted.count", options.block, options.slotTimestamp, options.rplPrice],
    );
    const [submittedBefore, countBefore, memberCount, threshold, pricesBefore] = await Promise.all([
        protocol.contracts.rocketStorage.getBool(nodeKey),
        protocol.contracts.rocketStorage.getUint(countKey),
        protocol.contracts.rocketDAONodeTrusted.getMemberCount(),
        protocol.contracts.rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold(),
        protocol.network.prices.details(),
    ]);
    assert.equal(submittedBefore, false);
    await protocol.network.prices.submit(options);
    const [submittedAfter, countAfter, pricesAfter] = await Promise.all([
        protocol.contracts.rocketStorage.getBool(nodeKey),
        protocol.contracts.rocketStorage.getUint(countKey),
        protocol.network.prices.details(),
    ]);
    assert.equal(submittedAfter, true);
    assert.equal(countAfter, countBefore + 1n);
    const reachedConsensus = 10n ** 18n * countAfter / memberCount >= threshold;
    if (pricesBefore.block === options.block) return;
    if (reachedConsensus) {
        assert.equal(pricesAfter.block, options.block);
        assert.equal(pricesAfter.rplPrice, options.rplPrice);
    } else {
        assert.deepEqual(pricesAfter, pricesBefore);
    }
}

export async function executePricesScenario(
    protocol: ProtocolView,
    options: { caller: string; block: bigint; slotTimestamp: bigint; rplPrice: bigint },
): Promise<void> {
    await protocol.network.prices.execute(options);
    assert.deepEqual(await protocol.network.prices.details(), {
        block: options.block,
        rplPrice: options.rplPrice,
    });
}
