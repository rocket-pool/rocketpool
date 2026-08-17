import assert from "assert";

import type { ProtocolCurrent } from "../../harness";

export async function challengeMegapoolValidatorsAndAssert(
    protocol: ProtocolCurrent,
    node: string,
    validatorIds: bigint[],
    challenger: string,
): Promise<void> {
    const megapool = await protocol.megapools.delegate(node);
    const before = await megapool.getLockedValidatorCount();
    const statesBefore = await Promise.all(validatorIds.map(id => megapool.getValidatorInfo(id)));
    const signer = await protocol.context.actor(challenger);
    await (await protocol.contracts.rocketMegapoolManager.connect(signer).challengeExit([{
        megapool: await protocol.megapools.address(node),
        validatorIds,
    }])).wait();
    assert.equal(
        (await protocol.contracts.rocketMegapoolManager.getLastChallenger()).toLowerCase(),
        (await signer.getAddress()).toLowerCase(),
    );
    const newlyLocked = statesBefore.filter(info => !info.locked).length;
    assert.equal(await megapool.getLockedValidatorCount(), before + BigInt(newlyLocked));
    for (const validatorId of validatorIds) {
        assert.equal((await megapool.getValidatorInfo(validatorId)).locked, true);
    }
}
