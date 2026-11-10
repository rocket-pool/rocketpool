import assert from "node:assert/strict";
import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { AbiCoder, getBytes, hexlify, ZeroHash } from "ethers";
import type { ProtocolCurrent } from "../../harness";
import { GLOAS_TEST_SLOT } from "../../harness/deployment";
import { currentSlot } from "./proofs";
import { hashPair, littleEndian, progressive, vector } from "../network/participation-proofs";

export type Deposit = { pubkey: string; withdrawalCredentials: string; amountInGwei: bigint; signature: string; slot: bigint };
export const MAINNET_DEPOSIT_DOMAIN = "0x03000000f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a9";
export const WRONG_CREDENTIALS = `0x02${"11".repeat(31)}`;
const pubkeyRoot = (pubkey: string) => hashPair(hexlify(getBytes(pubkey).slice(0, 32)), hexlify(new Uint8Array([...getBytes(pubkey).slice(32), ...new Uint8Array(16)])));
function signatureRoot(signature: string) {
    const bytes = getBytes(signature);
    assert.equal(bytes.length, 96);
    return vector(2, new Map([0n, 1n, 2n].map(i => [i, hexlify(bytes.slice(Number(i) * 32, Number(i + 1n) * 32))]))).root;
}

// Independent SSZ and noble BLS signatures; no calls to the Solidity utilities.
export function signedPendingDeposit(key = 42n, withdrawalCredentials = WRONG_CREDENTIALS, amountInGwei = 2_000_000_000n, slot = 0n, domain = MAINNET_DEPOSIT_DOMAIN): Deposit {
    const pubkey = hexlify(bls.getPublicKey(key));
    const message = vector(2, new Map([[0n, pubkeyRoot(pubkey)], [1n, withdrawalCredentials], [2n, littleEndian(amountInGwei)]])).root;
    const root = hashPair(message, domain);
    const point = bls.G2.hashToCurve(getBytes(root), { DST: "BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_" });
    const signature = hexlify(bls.Signature.toRawBytes(bls.G2.ProjectivePoint.fromAffine(point.toAffine()).multiply(key)));
    return { pubkey, withdrawalCredentials, amountInGwei, signature, slot };
}

function depositFields(deposit: Deposit) {
    return new Map<bigint, string>([[0n, pubkeyRoot(deposit.pubkey)], [1n, deposit.withdrawalCredentials], [2n, littleEndian(deposit.amountInGwei)], [3n, signatureRoot(deposit.signature)]]);
}
export function depositDataRoot(deposit: Deposit) { return vector(2, depositFields(deposit)).root; }

export type PendingProof = {
    timestamp: bigint;
    pendingDepositProof: { stateSlot: bigint; depositIndex: bigint; deposit: Deposit; witnesses: string[] };
    slotProof: { slot: bigint; witnesses: string[] };
};
export function encodePendingDepositProof(proof: PendingProof): string {
    return AbiCoder.defaultAbiCoder().encode([
        "tuple(tuple(uint64 stateSlot,uint64 depositIndex,tuple(bytes pubkey,bytes32 withdrawalCredentials,uint64 amountInGwei,bytes signature,uint64 slot) deposit,bytes32[] witnesses) pendingDepositProof,tuple(uint64 slot,bytes32[] witnesses) slotProof)",
    ], [proof]);
}

/** Synthetic states testing real proof authentication, not consensus validity. Historical anchors contain an empty pending queue. */
export async function pendingDepositProof(p: ProtocolCurrent, deposit: Deposit, options: {
    anchorSlot?: bigint; stateSlot?: bigint; depositIndex?: bigint; depositCount?: bigint; gloasSlot?: bigint;
} = {}): Promise<PendingProof> {
    const anchorSlot = options.anchorSlot ?? await currentSlot(p);
    const stateSlot = options.stateSlot ?? anchorSlot;
    const index = options.depositIndex ?? 5n;
    const count = options.depositCount ?? index + 1n;
    const gloasSlot = options.gloasSlot ?? GLOAS_TEST_SLOT;
    const state = (slot: bigint, fields: Map<bigint, string>) => {
        fields.set(2n, littleEndian(slot));
        return slot >= gloasSlot ? progressive(fields, littleEndian((1n << 46n) - 1n)) : vector(6, fields);
    };
    const fields = depositFields(deposit);
    fields.set(4n, littleEndian(deposit.slot));
    const leaf = vector(3, fields).root;
    const length = littleEndian(count);
    const pending = stateSlot >= gloasSlot ? progressive(new Map([[index, leaf]]), length) : vector(27, new Map([[index, leaf]]));
    const listRoot = stateSlot >= gloasSlot ? pending.root : hashPair(pending.root, length);
    const evidence = state(stateSlot, new Map([[34n, listRoot]]));
    const depositWitnesses = [...pending.witness(index), ...(stateSlot >= gloasSlot ? [] : [length]), ...evidence.witness(34n)];
    let anchor = evidence;
    if (stateSlot !== anchorSlot) {
        assert(stateSlot < anchorSlot);
        const roots = vector(13, new Map([[stateSlot % 8192n, evidence.root]]));
        const emptyPending = anchorSlot >= gloasSlot ? hashPair(ZeroHash, littleEndian(0n)) : hashPair(vector(27, new Map()).root, littleEndian(0n));
        const anchorFields = new Map([[34n, emptyPending]]);
        let historyField: bigint;
        if (anchorSlot - stateSlot > 8192n) {
            const offset = 194048n * 32n / 8192n;
            const summaryIndex = stateSlot / 8192n - offset;
            const summaries = vector(24, new Map([[summaryIndex, hashPair(ZeroHash, roots.root)]]));
            const summaryLength = littleEndian(anchorSlot / 8192n - offset);
            anchorFields.set(27n, hashPair(summaries.root, summaryLength));
            historyField = 27n;
            depositWitnesses.push(...roots.witness(stateSlot % 8192n), ZeroHash, ...summaries.witness(summaryIndex), summaryLength);
        } else {
            anchorFields.set(6n, roots.root);
            historyField = 6n;
            depositWitnesses.push(...roots.witness(stateSlot % 8192n));
        }
        anchor = state(anchorSlot, anchorFields);
        depositWitnesses.push(...anchor.witness(historyField));
    }
    const header = vector(3, new Map([[0n, littleEndian(anchorSlot)], [3n, anchor.root]]));
    const timestamp = await p.time.latest();
    await (await p.contracts.beaconStateVerifier.connect(await p.context.actor("finaliser")).setBlockRoot(timestamp, header.root)).wait();
    return {
        timestamp,
        pendingDepositProof: { stateSlot, depositIndex: index, deposit, witnesses: [...depositWitnesses, ...header.witness(3n)] },
        slotProof: { slot: anchorSlot, witnesses: [...anchor.witness(2n), ...header.witness(3n)] },
    };
}
