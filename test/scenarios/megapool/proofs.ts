import type { ProtocolCurrent } from "../../harness";

export const FAR_FUTURE_EPOCH = 2n ** 64n - 1n;
export const SECONDS_PER_SLOT = 12n;
export const SLOTS_PER_EPOCH = 32n;
export const BEACON_GENESIS_TIME = 1_606_824_023n;

export async function currentSlot(protocol: ProtocolCurrent): Promise<bigint> {
    const timestamp = await protocol.time.latest();
    return (timestamp - BEACON_GENESIS_TIME) / SECONDS_PER_SLOT;
}

export async function currentEpoch(protocol: ProtocolCurrent): Promise<bigint> {
    return (await currentSlot(protocol)) / SLOTS_PER_EPOCH;
}

export function slotProof(slot: bigint) {
    return { slot, witnesses: [] as string[] };
}

export async function validatorProof(
    protocol: ProtocolCurrent,
    node: string,
    validatorId: bigint,
    overrides: Partial<{
        pubkey: string;
        withdrawalCredentials: string;
        effectiveBalance: bigint;
        slashed: boolean;
        activationEligibilityEpoch: bigint;
        activationEpoch: bigint;
        exitEpoch: bigint;
        withdrawableEpoch: bigint;
    }> = {},
) {
    const megapool = await protocol.megapools.delegate(node);
    const [, pubkey] = await megapool.getValidatorInfoAndPubkey(validatorId);
    return {
        validatorIndex: validatorId,
        validator: {
            pubkey,
            withdrawalCredentials: await megapool.getWithdrawalCredentials(),
            effectiveBalance: 1_000_000_000n,
            slashed: false,
            activationEligibilityEpoch: FAR_FUTURE_EPOCH,
            activationEpoch: FAR_FUTURE_EPOCH,
            exitEpoch: FAR_FUTURE_EPOCH,
            withdrawableEpoch: FAR_FUTURE_EPOCH,
            ...overrides,
        },
        witnesses: [] as string[],
    };
}

export async function withdrawalProof(
    protocol: ProtocolCurrent,
    node: string,
    amount: bigint,
    withdrawalSlot: bigint,
    validatorId = 0n,
) {
    const address = await protocol.megapools.address(node);
    return {
        withdrawalSlot,
        withdrawalNum: 0n,
        withdrawal: {
            index: 0n,
            validatorIndex: validatorId,
            withdrawalCredentials: address,
            amountInGwei: amount / 1_000_000_000n,
        },
        witnesses: [] as string[],
    };
}
