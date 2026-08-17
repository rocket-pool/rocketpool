import assert from "assert";
import { isAddress, ZeroAddress } from "ethers";

import type { ProtocolCurrent } from "../../harness";

export interface WithdrawalAddressResult {
    withdrawalAddress: string;
    pendingWithdrawalAddress: string;
}

export async function setWithdrawalAddressAndAssert(
    protocol: ProtocolCurrent,
    options: {
        node: string;
        withdrawalAddress: string;
        confirm: boolean;
        caller?: string;
    },
): Promise<WithdrawalAddressResult> {
    const expectedAddress = isAddress(options.withdrawalAddress)
        ? options.withdrawalAddress
        : await protocol.nodes.address(options.withdrawalAddress);

    await protocol.nodes.setWithdrawalAddress(options.node, options.withdrawalAddress, {
        confirm: options.confirm,
        caller: options.caller,
    });

    const result = await getWithdrawalAddresses(protocol, options.node);
    if (options.confirm) {
        assert.equal(
            result.withdrawalAddress,
            expectedAddress,
            "Incorrect updated withdrawal address",
        );
    } else {
        assert.equal(
            result.pendingWithdrawalAddress,
            expectedAddress,
            "Incorrect pending withdrawal address",
        );
    }
    return result;
}

export async function confirmWithdrawalAddressAndAssert(
    protocol: ProtocolCurrent,
    options: {
        node: string;
        caller: string;
    },
): Promise<WithdrawalAddressResult> {
    const expectedAddress = await protocol.nodes.address(options.caller);
    await protocol.nodes.confirmWithdrawalAddress(options.node, {
        caller: options.caller,
    });

    const result = await getWithdrawalAddresses(protocol, options.node);
    assert.equal(
        result.withdrawalAddress,
        expectedAddress,
        "Incorrect confirmed withdrawal address",
    );
    assert.equal(
        result.pendingWithdrawalAddress,
        ZeroAddress,
        "Pending withdrawal address was not cleared",
    );
    return result;
}

async function getWithdrawalAddresses(
    protocol: ProtocolCurrent,
    node: string,
): Promise<WithdrawalAddressResult> {
    const [withdrawalAddress, pendingWithdrawalAddress] = await Promise.all([
        protocol.nodes.withdrawalAddress(node),
        protocol.nodes.pendingWithdrawalAddress(node),
    ]);
    return { withdrawalAddress, pendingWithdrawalAddress };
}
