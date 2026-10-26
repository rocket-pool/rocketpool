import type { ValidatorProofStruct, SlotProofStruct, WithdrawalProofStruct, ParticipationProofStruct } from "../../harness/bindings/fixtures/BeaconStateVerifierHarness";
import { GLOAS_TEST_SLOT } from "../../harness/deployment";
import { encodeValidatorProofV1, encodeSlotProofV1, encodeParticipationProofV1, encodeFinalBalanceProofV1, encodeFinalBalanceProofV2 } from "../../../test-unit/util/proof-encoding";
export { encodeValidatorProofV1, encodeSlotProofV1, encodeParticipationProofV1, encodeFinalBalanceProofV1, encodeFinalBalanceProofV2 };

// Encode at the call boundary so scenarios can mutate individual proof facts before submission.
export function validatorProofArgs<P extends unknown[]>(...args: [...P, ValidatorProofStruct, SlotProofStruct]): [...P, bigint, string] {
    const [validator, slot] = args.slice(-2) as [ValidatorProofStruct, SlotProofStruct];
    return [...args.slice(0, -2), 1n, encodeValidatorProofV1(validator, slot)] as [...P, bigint, string];
}
export function slotProofArgs<P extends unknown[]>(...args: [...P, SlotProofStruct]): [...P, bigint, string] {
    return [...args.slice(0, -1), 1n, encodeSlotProofV1(args.at(-1) as SlotProofStruct)] as [...P, bigint, string];
}
export function participationProofArgs<P extends unknown[]>(...args: [...P, ValidatorProofStruct, ParticipationProofStruct, SlotProofStruct]): [...P, bigint, string] {
    const [validator, participation, slot] = args.slice(-3) as [ValidatorProofStruct, ParticipationProofStruct, SlotProofStruct];
    return [...args.slice(0, -3), 1n, encodeParticipationProofV1(validator, participation, slot)] as [...P, bigint, string];
}
export function finalBalanceProofArgs<P extends unknown[]>(...args: [...P, WithdrawalProofStruct, ValidatorProofStruct, SlotProofStruct]): [...P, bigint, string] {
    const [withdrawal, validator, slot] = args.slice(-3) as [WithdrawalProofStruct, ValidatorProofStruct, SlotProofStruct];
    const gloas = BigInt(withdrawal.withdrawalSlot) >= GLOAS_TEST_SLOT;
    const data = gloas ? encodeFinalBalanceProofV2(withdrawal, validator, slot, {
        nextWithdrawalIndex: BigInt(withdrawal.withdrawal.index) - BigInt(withdrawal.withdrawalNum), witnesses: [],
    }) : encodeFinalBalanceProofV1(withdrawal, validator, slot);
    return [...args.slice(0, -3), gloas ? 2n : 1n, data] as [...P, bigint, string];
}
