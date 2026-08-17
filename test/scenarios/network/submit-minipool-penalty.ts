import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolV14 } from "../../harness";

export async function submitMinipoolPenaltyScenario(
    protocol: ProtocolV14,
    options: { minipool: string; caller: string; block: bigint },
): Promise<void> {
    const address = protocol.minipools.get(options.minipool).address;
    const callerAddress = await protocol.nodes.address(options.caller);
    const nodeKey = ethers.solidityPackedKeccak256(
        ["string", "address", "address", "uint256"],
        ["minipool.penalty.submission", callerAddress, address, options.block],
    );
    const countKey = ethers.solidityPackedKeccak256(
        ["string", "address", "uint256"],
        ["minipool.penalty.submission", address, options.block],
    );
    const appliedKey = ethers.solidityPackedKeccak256(
        ["string", "address", "uint256"],
        ["minipool.penalty.submission.applied", address, options.block],
    );
    const penaltyKey = ethers.solidityPackedKeccak256(
        ["string", "address"],
        ["network.penalties.penalty", address],
    );
    const [submittedBefore, countBefore, appliedBefore, penaltyBefore, members, threshold] = await Promise.all([
        protocol.contracts.rocketStorage.getBool(nodeKey),
        protocol.contracts.rocketStorage.getUint(countKey),
        protocol.contracts.rocketStorage.getBool(appliedKey),
        protocol.contracts.rocketStorage.getUint(penaltyKey),
        protocol.contracts.rocketDAONodeTrusted.getMemberCount(),
        protocol.contracts.rocketDAOProtocolSettingsNetwork.getNodePenaltyThreshold(),
    ]);
    const signer = await protocol.context.actor(options.caller);
    assert.equal(submittedBefore, false);
    if (appliedBefore) {
        await assert.rejects(
            protocol.contracts.rocketNetworkPenalties.connect(signer).submitPenalty(address, options.block),
            /Penalty already applied/,
        );
        return;
    }
    await (await protocol.contracts.rocketNetworkPenalties.connect(signer).submitPenalty(
        address,
        options.block,
    )).wait();
    const [submittedAfter, countAfter, appliedAfter, penaltyAfter] = await Promise.all([
        protocol.contracts.rocketStorage.getBool(nodeKey),
        protocol.contracts.rocketStorage.getUint(countKey),
        protocol.contracts.rocketStorage.getBool(appliedKey),
        protocol.contracts.rocketStorage.getUint(penaltyKey),
    ]);
    assert.equal(submittedAfter, true);
    assert.equal(countAfter, countBefore + 1n);
    const reachesConsensus = 10n ** 18n * countAfter / members >= threshold;
    assert.equal(appliedAfter, reachesConsensus);
    assert.equal(penaltyAfter, penaltyBefore + (reachesConsensus ? 1n : 0n));
}
