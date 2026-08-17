import assert from "assert";
import { parseUnits } from "ethers";

import type { ProtocolCurrent, ProtocolV131 } from "../../harness";

const GAS_PRICE = parseUnits("20", "gwei");

type CloseProtocol = ProtocolV131 | ProtocolCurrent;

export interface CloseMinipoolResult {
    borrowedDelta: bigint;
    withdrawalDelta: bigint;
    transactionFee: bigint;
}

export async function closeMinipoolScenario(
    protocol: CloseProtocol,
    options: { minipool: string; caller: string },
): Promise<CloseMinipoolResult> {
    const entity = protocol.minipools.get(options.minipool);
    const [nodeAddress, withdrawalAddress, withdrawalBefore, borrowedBefore, minipool] = await Promise.all([
        protocol.nodes.address(entity.node),
        protocol.nodes.withdrawalAddress(entity.node),
        protocol.nodes.withdrawalBalance(entity.node),
        protocol.nodes.borrowedEth(entity.node),
        protocol.minipools.details(options.minipool),
    ]);

    const receipt = await protocol.minipools.close(options.minipool, {
        caller: options.caller,
        gasPrice: GAS_PRICE,
    });
    const [withdrawalAfter, borrowedAfter] = await Promise.all([
        protocol.nodes.withdrawalBalance(entity.node),
        protocol.nodes.borrowedEth(entity.node),
    ]);

    const transactionFee = GAS_PRICE * receipt.gasUsed;
    const expectedWithdrawalDelta = minipool.balance
        - (withdrawalAddress === nodeAddress ? transactionFee : 0n);
    const withdrawalDelta = withdrawalAfter - withdrawalBefore;
    const borrowedDelta = borrowedBefore - borrowedAfter;

    assert.equal(withdrawalDelta, expectedWithdrawalDelta, "Incorrect node ETH balance change");
    assert.equal(
        borrowedDelta,
        minipool.userDepositBalance,
        "Incorrect node borrowed ETH change",
    );

    return {
        borrowedDelta,
        withdrawalDelta,
        transactionFee,
    };
}
