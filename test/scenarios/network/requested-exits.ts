import assert from "node:assert/strict";
import { MaxUint256 } from "ethers";
import type { ProtocolCurrent } from "../../harness";

export type RequestedExitIdentity = [pool: string, validatorId: bigint, isMegapool: boolean];

/** Read-only snapshot, also usable when a rollback test deliberately corrupts accounting. */
export async function getRequestedExitIdentities(current: ProtocolCurrent): Promise<RequestedExitIdentity[]> {
    const entries = await current.contracts.rocketNetworkExit.getRequestedExits(0n, MaxUint256);
    return entries.map(entry => [entry.pool, entry.validatorId, entry.isMegapool]);
}

/** Cross-check enumeration against independent request state and capital accounting. */
export async function assertRequestedExitIndex(current: ProtocolCurrent): Promise<RequestedExitIdentity[]> {
    const exits = current.contracts.rocketNetworkExit;
    const entries = await exits.getRequestedExits(0n, MaxUint256);
    assert.equal(BigInt(entries.length), await exits.getRequestedExitCount());
    const identities: RequestedExitIdentity[] = [];
    let capital = 0n;
    for (const [index, entry] of entries.entries()) {
        const identity: RequestedExitIdentity = [entry.pool, entry.validatorId, entry.isMegapool];
        assert.deepEqual(Array.from(await exits.getRequestedExitAt(index)), identity);
        identities.push(identity);
        if (entry.isMegapool) {
            assert.equal(await exits.getMegapoolExitType(entry.pool, entry.validatorId), 1n);
            assert.notEqual(await exits.getMegapoolCooperativeExitStart(entry.pool, entry.validatorId), 0n);
            capital += await exits.getMegapoolExpectedUserCapital(entry.pool, entry.validatorId);
        } else {
            assert.equal(entry.validatorId, 0n);
            assert.notEqual(await exits.getMinipoolCooperativeExitStart(entry.pool), 0n);
            capital += await exits.getMinipoolExpectedUserCapital(entry.pool);
        }
    }
    assert.equal(new Set(identities.map(identity => identity.join(":"))).size, identities.length);
    assert.equal(capital, await exits.getRequestedEth());
    return identities;
}
