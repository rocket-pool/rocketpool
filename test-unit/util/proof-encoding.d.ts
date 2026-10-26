import type { ValidatorProofStruct, SlotProofStruct, WithdrawalProofStruct, ParticipationProofStruct, NextWithdrawalIndexProofStruct } from "../../test/harness/bindings/fixtures/BeaconStateVerifierHarness";
export function encodeValidatorProofV1(validator: ValidatorProofStruct, slot: SlotProofStruct): string;
export function encodeSlotProofV1(slot: SlotProofStruct): string;
export function encodeParticipationProofV1(validator: ValidatorProofStruct, participation: ParticipationProofStruct, slot: SlotProofStruct): string;
export function encodeFinalBalanceProofV1(withdrawal: WithdrawalProofStruct, validator: ValidatorProofStruct, slot: SlotProofStruct): string;
export function encodeFinalBalanceProofV2(withdrawal: WithdrawalProofStruct, validator: ValidatorProofStruct, slot: SlotProofStruct, previous: NextWithdrawalIndexProofStruct): string;
