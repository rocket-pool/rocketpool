import assert from "assert";

import type { ProtocolCurrent, ProtocolV131, ProtocolV14, StakeMinipoolOptions } from "../../harness";

type MinipoolProtocol = ProtocolV131 | ProtocolV14 | ProtocolCurrent;

export async function stakeMinipoolAndAssert(
    protocol: MinipoolProtocol,
    name: string,
    options: StakeMinipoolOptions = {},
): Promise<void> {
    const before = await protocol.minipools.details(name);
    const expectedDeposit = before.depositType === 4 ? 31n * 10n ** 18n : 16n * 10n ** 18n;

    await protocol.minipools.stake(name, options);

    const [after, reverseAddress] = await Promise.all([
        protocol.minipools.details(name),
        protocol.minipools.addressForPubkey(before.pubkey),
    ]);
    assert.notEqual(before.status, 2, "Minipool was already staking");
    assert.equal(after.status, 2, "Minipool did not enter staking status");
    assert.equal(before.balance - after.balance, expectedDeposit, "Incorrect staking deposit amount");
    assert.equal(reverseAddress, protocol.minipools.get(name).address, "Incorrect minipool pubkey mapping");
}
