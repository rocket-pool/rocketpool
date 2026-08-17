import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolView } from "../../harness";

export async function depositAndAssert(
    protocol: ProtocolView,
    options: { depositor: string; amount: bigint },
): Promise<void> {
    const depositorAddress = await protocol.nodes.address(options.depositor);
    const vaultAddress = await protocol.contracts.rocketVault.getAddress();
    const [poolBefore, vaultBefore, rethBefore, depositFee] = await Promise.all([
        protocol.depositPool.balances(),
        ethers.provider.getBalance(vaultAddress),
        protocol.tokens.rethBalance(options.depositor),
        protocol.depositPool.depositFee(),
    ]);

    await protocol.depositPool.deposit(options.depositor, options.amount);

    const expectedReth = await protocol.tokens.rethValue(
        options.amount - options.amount * depositFee / 10n ** 18n,
    );
    const [poolAfter, vaultAfter, rethAfter] = await Promise.all([
        protocol.depositPool.balances(),
        ethers.provider.getBalance(vaultAddress),
        protocol.contracts.rocketTokenRETH.balanceOf(depositorAddress),
    ]);

    assert.equal(poolAfter.total, poolBefore.total + options.amount);
    assert.equal(vaultAfter, vaultBefore + options.amount);
    assert.equal(rethAfter, rethBefore + expectedReth);
}
