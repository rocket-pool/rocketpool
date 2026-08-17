import assert from "assert";

import type { ProtocolCurrent } from "../../harness";
import { currentSlot, slotProof, validatorProof } from "./proofs";

export async function notifyMegapoolExitAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    validatorId: bigint,
    withdrawableEpoch: bigint,
): Promise<void> {
    const megapool = await protocol.megapools.delegate(node);
    const exitingBefore = await megapool.getExitingValidatorCount();
    const timestamp = await protocol.time.latest();
    const slot = await currentSlot(protocol);
    const submitter = await protocol.context.actor("proofSubmitter");
    await (await protocol.contracts.rocketMegapoolManager.connect(submitter).notifyExit(
        await protocol.megapools.address(node),
        validatorId,
        timestamp,
        await validatorProof(protocol, node, validatorId, { withdrawableEpoch }),
        slotProof(slot),
    )).wait();
    const info = await megapool.getValidatorInfo(validatorId);
    assert.equal(info.exiting, true);
    assert.equal(info.exited, false);
    assert.equal(info.locked, false);
    assert.equal(await megapool.getExitingValidatorCount(), exitingBefore + 1n);
}
