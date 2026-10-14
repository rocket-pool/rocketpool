import type { ValidatorStruct, WithdrawalStruct } from "../../test/harness/bindings/fixtures/BeaconStateVerifierHarness";
export function toLittleEndian(value: bigint | number | string): string;
export function progressivePath(index: bigint | number): string;
export function makeMultiProofs(leaves: {path: string; leaf: string}[]): {root: string; witnesses: Map<string, string[]>};
export function merkleiseValidator(validator: ValidatorStruct): string;
export function merkleiseWithdrawal(withdrawal: WithdrawalStruct): string;
