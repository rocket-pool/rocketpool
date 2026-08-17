import assert from "assert";
import { parseUnits } from "ethers";

import type { ProtocolCurrent, ProtocolV131 } from "../../harness";

const GAS_PRICE = parseUnits("20", "gwei");

type RefundProtocol = ProtocolV131 | ProtocolCurrent;

export interface RefundMinipoolResult {
    refund: bigint;
    withdrawalDelta: bigint;
    transactionFee: bigint;
}

export async function refundMinipoolScenario(
    protocol: RefundProtocol,
    name: string,
): Promise<RefundMinipoolResult> {
    const entity = protocol.minipools.get(name);
    const [nodeAddress, withdrawalAddress, withdrawalBefore, before] = await Promise.all([
        protocol.nodes.address(entity.node),
        protocol.nodes.withdrawalAddress(entity.node),
        protocol.nodes.withdrawalBalance(entity.node),
        protocol.minipools.details(name),
    ]);

    const receipt = await protocol.minipools.refund(name, {
        caller: entity.node,
        gasPrice: GAS_PRICE,
    });
    const [withdrawalAfter, after] = await Promise.all([
        protocol.nodes.withdrawalBalance(entity.node),
        protocol.minipools.details(name),
    ]);

    const transactionFee = GAS_PRICE * receipt.gasUsed;
    const expectedWithdrawalDelta = before.nodeRefundBalance
        - (withdrawalAddress === nodeAddress ? transactionFee : 0n);
    const withdrawalDelta = withdrawalAfter - withdrawalBefore;

    assert(before.nodeRefundBalance > 0n, "Initial node refund balance was zero");
    assert.equal(after.nodeRefundBalance, 0n, "Node refund balance was not cleared");
    assert.equal(
        after.balance,
        before.balance - before.nodeRefundBalance,
        "Incorrect minipool ETH balance change",
    );
    assert.equal(
        withdrawalDelta,
        expectedWithdrawalDelta,
        "Incorrect withdrawal-address ETH balance change",
    );

    return {
        refund: before.nodeRefundBalance,
        withdrawalDelta,
        transactionFee,
    };
}
