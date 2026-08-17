import assert from "assert";

import type { ProtocolCurrent } from "../../harness";
import {
    currentEpoch,
    currentSlot,
    slotProof,
    SLOTS_PER_EPOCH,
    validatorProof,
    withdrawalProof,
} from "./proofs";

export async function finaliseMegapoolValidatorAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    validatorId: bigint,
    amount: bigint,
    options: {
        caller?: string;
        funder?: string;
        withdrawalSlot?: bigint;
        withdrawalValidatorId?: bigint;
        withdrawableEpoch?: bigint;
    } = {},
): Promise<void> {
    const megapool = await protocol.megapools.delegate(node);
    const funder = await protocol.context.actor(options.funder ?? "withdrawalFunder");
    await (await funder.sendTransaction({ to: await protocol.megapools.address(node), value: amount })).wait();
    const epoch = await currentEpoch(protocol);
    const slot = await currentSlot(protocol);
    const timestamp = await protocol.time.latest();
    const caller = await protocol.context.actor(options.caller ?? node);
    await (await protocol.contracts.rocketMegapoolManager.connect(caller).notifyFinalBalance(
        await protocol.megapools.address(node),
        validatorId,
        timestamp,
        await withdrawalProof(
            protocol,
            node,
            amount,
            options.withdrawalSlot ?? epoch * SLOTS_PER_EPOCH,
            options.withdrawalValidatorId ?? validatorId,
        ),
        await validatorProof(protocol, node, validatorId, {
            withdrawableEpoch: options.withdrawableEpoch ?? epoch,
        }),
        slotProof(slot),
    )).wait();
    const info = await megapool.getValidatorInfo(validatorId);
    assert.equal(info.exiting, false);
    assert.equal(info.exited, true);
    assert.equal(info.exitBalance, amount / 1_000_000_000n);
}
