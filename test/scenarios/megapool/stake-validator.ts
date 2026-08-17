import assert from "assert";

import type { ProtocolCurrent } from "../../harness";
import { currentSlot, slotProof, validatorProof } from "./proofs";

export async function stakeMegapoolValidatorAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    validatorId: bigint,
    caller = "proofSubmitter",
): Promise<void> {
    const megapool = await protocol.megapools.delegate(node);
    const before = await megapool.getValidatorInfo(validatorId);
    const assignedBefore = await megapool.getAssignedValue();
    const timestamp = await protocol.time.latest();
    const slot = await currentSlot(protocol);
    const submitter = await protocol.context.actor(caller);
    await (await protocol.contracts.rocketMegapoolManager.connect(submitter).stake(
        await protocol.megapools.address(node),
        validatorId,
        timestamp,
        await validatorProof(protocol, node, validatorId),
        slotProof(slot),
    )).wait();
    const after = await megapool.getValidatorInfo(validatorId);
    assert.equal(before.inPrestake, true);
    assert.equal(after.staked, true);
    assert.equal(after.inQueue, false);
    assert.equal(after.inPrestake, false);
    assert.equal(after.dissolved, false);
    assert.equal(await megapool.getAssignedValue() < assignedBefore, true);
    assert.notEqual(await megapool.getLastDistributionTime(), 0n);
}
