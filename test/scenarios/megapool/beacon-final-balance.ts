import { ZeroHash } from "ethers";
import type { ProtocolCurrent } from "../../harness";
import { currentSlot, validatorProof } from "./proofs";
import { encodeFinalBalanceProofV2 } from "./proof-encoding";
import { makeMultiProofs, merkleiseValidator, merkleiseWithdrawal, progressivePath, toLittleEndian } from "../../../test-unit/util/proof-tree";

/** A real, independently constructed V2 bundle for lifecycle tests, anchored to the test root oracle. */
export async function finalBalanceBeaconProof(protocol: ProtocolCurrent, validatorId: bigint, amount: bigint, withdrawableEpoch: bigint) {
    const slot = await currentSlot(protocol);
    const withdrawalSlot = slot - 2n;
    const validator = await validatorProof(protocol, "node", validatorId, { effectiveBalance: 32_000_000_000n, activationEpoch: 0n, exitEpoch: withdrawableEpoch, withdrawableEpoch });
    const withdrawal = { index: 100n, validatorIndex: validatorId, withdrawalCredentials: await protocol.megapools.address("node"), amountInGwei: amount / 1_000_000_000n };
    const state = (past: bigint) => '011' + progressivePath(6) + (past % 8192n).toString(2).padStart(13, '0');
    const paths = {
        slot: '011' + progressivePath(2),
        validator: '011' + progressivePath(11) + progressivePath(validatorId),
        withdrawal: state(withdrawalSlot) + progressivePath(44) + progressivePath(0),
        index: state(withdrawalSlot - 1n) + progressivePath(25),
        balance: state(withdrawalSlot) + progressivePath(12) + progressivePath(validatorId / 4n),
    };
    const tree = makeMultiProofs([
        { path: paths.slot, leaf: toLittleEndian(slot) },
        { path: paths.validator, leaf: merkleiseValidator(validator.validator) },
        { path: paths.withdrawal, leaf: merkleiseWithdrawal(withdrawal) },
        { path: paths.index, leaf: toLittleEndian(100n) },
        { path: paths.balance, leaf: ZeroHash },
    ]);
    const timestamp = await protocol.time.latest();
    await (await protocol.contracts.beaconStateVerifier.connect(await protocol.context.guardian()).setBlockRoot(timestamp, tree.root)).wait();
    const proofData = encodeFinalBalanceProofV2(
        { withdrawalSlot, withdrawalNum: 0n, withdrawal, witnesses: tree.witnesses.get(paths.withdrawal)! },
        { ...validator, witnesses: tree.witnesses.get(paths.validator)! },
        { slot, witnesses: tree.witnesses.get(paths.slot)! },
        { nextWithdrawalIndex: 100n, witnesses: tree.witnesses.get(paths.index)! },
        { balanceChunk: ZeroHash, witnesses: tree.witnesses.get(paths.balance)! },
    );
    return { timestamp, proofData };
}
