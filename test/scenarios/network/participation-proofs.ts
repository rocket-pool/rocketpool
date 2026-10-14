import { BlockRootsMock__factory } from "../../harness/bindings/fixtures";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getBytes, hexlify, toBeHex, ZeroHash } from "ethers";
import { GLOAS_TEST_SLOT } from "../../harness/deployment";
import type { ProtocolCurrent, ProtocolV141 } from "../../harness";
import { BEACON_GENESIS_TIME, currentSlot, FAR_FUTURE_EPOCH, validatorProof } from "../megapool/proofs";

// Independent test-side SHA-256 trees. No calls to the Solidity Merkle helpers.
export function hashPair(left: string, right: string): string {
    return `0x${createHash("sha256").update(getBytes(left)).update(getBytes(right)).digest("hex")}`;
}

export function littleEndian(value: bigint): string {
    return hexlify(getBytes(toBeHex(value, 32)).reverse());
}

/** Sparse fixed-depth SSZ vector, including canonical zero subtrees. */
function vector(depth: number, leaves: Map<bigint, string>) {
    const levels = [leaves];
    const zeroes = [ZeroHash];
    for (let level = 0; level < depth; level++) {
        const previous = levels[level];
        const next = new Map<bigint, string>();
        for (const index of previous.keys()) {
            const parent = index / 2n;
            next.set(parent, hashPair(previous.get(parent * 2n) ?? zeroes[level], previous.get(parent * 2n + 1n) ?? zeroes[level]));
        }
        levels.push(next);
        zeroes.push(hashPair(zeroes[level], zeroes[level]));
    }
    return {
        root: levels[depth].get(0n) ?? zeroes[depth],
        witness(index: bigint): string[] {
            assert(index >= 0n && index < 2n ** BigInt(depth));
            const result: string[] = [];
            for (let level = 0; level < depth; level++, index /= 2n) {
                result.push(levels[level].get(index ^ 1n) ?? zeroes[level]);
            }
            return result;
        },
    };
}

/** Independent progressive SSZ tree: groups of 1, 4, 16, ... leaves and a mix-in. */
function progressive(leaves: Map<bigint, string>, mixin: string) {
    function group(offset: bigint, depth: number): { root: string; witness(index: bigint): string[] } {
        const size = 1n << BigInt(depth);
        const selected = new Map([...leaves].filter(([i]) => i >= offset && i < offset + size).map(([i, value]) => [i - offset, value]));
        const subtree = vector(depth, selected);
        const more = [...leaves.keys()].some(i => i >= offset + size);
        const next = more ? group(offset + size, depth + 2) : null;
        const right = next?.root ?? ZeroHash;
        return {
            root: hashPair(subtree.root, right),
            witness(index: bigint): string[] {
                return index < offset + size
                    ? [...subtree.witness(index - offset), right]
                    : [...next!.witness(index), subtree.root];
            },
        };
    }
    const data = group(0n, 0);
    return { root: hashPair(data.root, mixin), witness: (index: bigint) => [...data.witness(index), mixin] };
}

export function bitmap(period: number, offsets: number[]): bigint[] {
    const words = Array<bigint>(Math.ceil(period / 256)).fill(0n);
    for (const offset of offsets) {
        assert(offset >= 0 && offset < words.length * 256);
        words[Math.floor(offset / 256)] |= 1n << BigInt(offset % 256);
    }
    return words;
}

export function challengeTree(words: bigint[]) {
    return vector(Math.ceil(Math.log2(words.length)), new Map(words.map((word, index) => [BigInt(index), toBeHex(word, 32)])));
}

/**
 * Synthetic Electra/Fulu/Gloas Beacon States anchored through the existing test root oracle.
 * These test proof verification, not consensus validity of the synthetic state.
 * All three proofs share one header; historical participation uses an older state.
 */
export async function beaconProofs(current: ProtocolCurrent | ProtocolV141, options: {
    validatorId?: bigint;
    validator?: Awaited<ReturnType<typeof validatorProof>>;
    validatorIndex?: bigint;
    activationEpoch?: bigint;
    participationEpoch: bigint;
    anchorSlot?: bigint;
    gloasSlot?: bigint;
    flags?: number;
    neighbourFlags?: number;
}) {
    const index = options.validatorIndex ?? 31n;
    const slot = options.anchorSlot ?? await currentSlot(current);
    const gloasSlot = options.gloasSlot ?? GLOAS_TEST_SLOT;
    const isGloas = slot >= gloasSlot;
    const timestamp = await current.time.latest();
    const participationSlot = (options.participationEpoch + 1n) * 32n;
    assert(slot > participationSlot, "Participation state must precede the anchor state");
    const validator = options.validator ?? await validatorProof(current, "node", options.validatorId ?? 0n, {
        activationEpoch: options.activationEpoch ?? 0n,
        activationEligibilityEpoch: 0n,
        withdrawableEpoch: FAR_FUTURE_EPOCH,
    });
    validator.validatorIndex = index;
    const v = validator.validator;
    const pubkey = getBytes(v.pubkey);
    const pubkeyRoot = hashPair(hexlify(pubkey.slice(0, 32)), hexlify(new Uint8Array([...pubkey.slice(32), ...new Uint8Array(16)])));
    const validatorRoot = vector(3, new Map([
        [0n, pubkeyRoot], [1n, v.withdrawalCredentials], [2n, littleEndian(v.effectiveBalance)],
        [3n, littleEndian(v.slashed ? 1n : 0n)], [4n, littleEndian(v.activationEligibilityEpoch)],
        [5n, littleEndian(v.activationEpoch)], [6n, littleEndian(v.exitEpoch)], [7n, littleEndian(v.withdrawableEpoch)],
    ])).root;
    // Include the full packed chunk so neighbouring flag bytes are within the list.
    const validatorLength = littleEndian((index / 32n + 1n) * 32n);
    const validators = isGloas ? progressive(new Map([[index, validatorRoot]]), validatorLength) : vector(40, new Map([[index, validatorRoot]]));
    const flags = new Uint8Array(32);
    flags[Number(index % 32n)] = options.flags ?? 2;
    flags[Number((index % 32n + 1n) % 32n)] = options.neighbourFlags ?? 0;
    const chunk = hexlify(flags);
    const pastGloas = participationSlot >= gloasSlot;
    const participation = pastGloas ? progressive(new Map([[index / 32n, chunk]]), validatorLength) : vector(35, new Map([[index / 32n, chunk]]));
    const stateFields = (stateSlot: bigint) => new Map<bigint, string>([
        [0n, littleEndian(BEACON_GENESIS_TIME)],
        [1n, "0x4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95"],
        [2n, littleEndian(stateSlot)], [11n, isGloas ? validators.root : hashPair(validators.root, validatorLength)],
    ]);
    const pastFields = stateFields(participationSlot);
    pastFields.set(15n, pastGloas ? participation.root : hashPair(participation.root, validatorLength));
    const pastState = pastGloas ? progressive(pastFields, littleEndian((1n << 46n) - 1n)) : vector(6, pastFields);
    const roots = vector(13, new Map([[participationSlot % 8192n, pastState.root]]));
    const anchorFields = stateFields(slot);
    let historyWitness: string[];
    let historyField: bigint;
    if (slot - participationSlot > 8192n) {
        const capellaSlot = 194048n * 32n;
        const summaryIndex = participationSlot / 8192n - capellaSlot / 8192n;
        assert(summaryIndex >= 0n);
        const summaryRoot = hashPair(ZeroHash, roots.root);
        const summaries = vector(24, new Map([[summaryIndex, summaryRoot]]));
        const length = littleEndian(slot / 8192n - capellaSlot / 8192n);
        anchorFields.set(27n, hashPair(summaries.root, length));
        historyField = 27n;
        historyWitness = [...roots.witness(participationSlot % 8192n), ZeroHash, ...summaries.witness(summaryIndex), length];
    } else {
        anchorFields.set(6n, roots.root);
        historyField = 6n;
        historyWitness = roots.witness(participationSlot % 8192n);
    }
    const state = isGloas ? progressive(anchorFields, littleEndian((1n << 46n) - 1n)) : vector(6, anchorFields);
    const header = vector(3, new Map([[0n, littleEndian(slot)], [3n, state.root]]));
    validator.witnesses = [...validators.witness(index), ...(isGloas ? [] : [validatorLength]), ...state.witness(11n), ...header.witness(3n)];
    const signer = await current.context.actor("finaliser");
    const oracle = current.release === "current" ? current.contracts.beaconStateVerifier.connect(signer)
        : BlockRootsMock__factory.connect(current.context.deployment.active.get("beaconRootsOracle")!.address, signer);
    await (await oracle.setBlockRoot(timestamp, header.root)).wait();
    return {
        timestamp,
        slotProof: { slot, witnesses: [...state.witness(2n), ...header.witness(3n)] },
        validatorProof: validator,
        participationProof: {
            participationSlot, validatorIndex: index, participationFlagsChunk: chunk,
            witnesses: [...participation.witness(index / 32n), ...(pastGloas ? [] : [validatorLength]), ...pastState.witness(15n),
                ...historyWitness, ...state.witness(historyField), ...header.witness(3n)],
        },
    };
}
