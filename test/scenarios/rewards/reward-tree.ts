import { Buffer } from "buffer";
import { ethers } from "../../../test-old/_utils/hardhat-runtime";

export interface RewardRow {
    address: string;
    network: number;
    trustedNodeRpl: bigint;
    nodeRpl: bigint;
    nodeEth: bigint;
    voterEth?: bigint;
}

export interface RewardProof {
    amountRpl: bigint;
    amountNodeEth: bigint;
    amountVoterEth: bigint;
    proof: string[];
}

function hash(left: Buffer, right: Buffer): Buffer {
    const data = Buffer.concat([left, right].sort(Buffer.compare));
    return Buffer.from(ethers.getBytes(ethers.keccak256(data)));
}

function leaf(row: RewardRow, version: 0 | 1): Buffer {
    const values = [
        ethers.getAddress(row.address),
        BigInt(row.network),
        row.trustedNodeRpl + row.nodeRpl,
        row.nodeEth,
    ];
    const types = ["address", "uint256", "uint256", "uint256"];
    if (version === 1) {
        types.push("uint256");
        values.push(row.voterEth ?? 0n);
    }
    return Buffer.from(ethers.getBytes(ethers.solidityPackedKeccak256(types, values)));
}

export function buildRewardTree(rows: RewardRow[], version: 0 | 1): {
    root: string;
    claims: Map<string, RewardProof>;
} {
    const ordered = [...rows].sort((a, b) => a.address.localeCompare(b.address));
    let elements = ordered.map(row => leaf(row, version)).sort(Buffer.compare);
    const targetLength = 2 ** Math.ceil(Math.log2(elements.length));
    while (elements.length < targetLength) elements.push(Buffer.alloc(32));
    const layers: Buffer[][] = [elements];
    while (layers.at(-1)!.length > 1) {
        const current = layers.at(-1)!;
        const next: Buffer[] = [];
        for (let i = 0; i < current.length; i += 2) next.push(hash(current[i], current[i + 1]));
        layers.push(next);
    }

    const claims = new Map<string, RewardProof>();
    for (const row of ordered) {
        const element = leaf(row, version);
        let index = elements.findIndex(candidate => candidate.equals(element));
        const proof: string[] = [];
        for (const layer of layers.slice(0, -1)) {
            proof.push(ethers.hexlify(layer[index % 2 === 0 ? index + 1 : index - 1]));
            index = Math.floor(index / 2);
        }
        claims.set(ethers.getAddress(row.address), {
            amountRpl: row.trustedNodeRpl + row.nodeRpl,
            amountNodeEth: row.nodeEth,
            amountVoterEth: row.voterEth ?? 0n,
            proof,
        });
    }
    return { root: ethers.hexlify(layers.at(-1)![0]), claims };
}
