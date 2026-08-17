import assert from "assert";

import type { ProtocolCurrent } from "../../harness";
import { currentSlot, slotProof, validatorProof } from "./proofs";

export async function dissolveMegapoolValidatorAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    validatorId: bigint,
    options: { caller?: string; proofOverrides?: Parameters<typeof validatorProof>[3] } = {},
): Promise<void> {
    const caller = options.caller ?? node;
    if (options.proofOverrides) {
        const signer = await protocol.context.actor(caller);
        const timestamp = await protocol.time.latest();
        const slot = await currentSlot(protocol);
        await (await protocol.contracts.rocketMegapoolManager.connect(signer).dissolve(
            await protocol.megapools.address(node),
            validatorId,
            timestamp,
            await validatorProof(protocol, node, validatorId, options.proofOverrides),
            slotProof(slot),
        )).wait();
    } else {
        await (await (await protocol.megapools.delegate(node, caller)).dissolveValidator(validatorId)).wait();
    }
    assert.equal((await (await protocol.megapools.delegate(node)).getValidatorInfo(validatorId)).dissolved, true);
}
