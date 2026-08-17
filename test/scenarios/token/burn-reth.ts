import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolView } from "../../harness";

export async function burnRethAndAssert(
    protocol: ProtocolView,
    options: { holder: string; amount: bigint },
): Promise<void> {
    const holderAddress = await protocol.nodes.address(options.holder);
    const [supplyBefore, rethBefore, ethBefore, expectedEth] = await Promise.all([
        protocol.tokens.rethSupply(),
        protocol.tokens.rethBalance(options.holder),
        ethers.provider.getBalance(holderAddress),
        protocol.tokens.rethEthValue(options.amount),
    ]);

    const receipt = await protocol.tokens.burnReth(options.holder, options.amount);
    const [supplyAfter, rethAfter, ethAfter] = await Promise.all([
        protocol.tokens.rethSupply(),
        protocol.tokens.rethBalance(options.holder),
        ethers.provider.getBalance(holderAddress),
    ]);
    const transactionFee = receipt.gasUsed * receipt.gasPrice;

    assert.equal(supplyAfter, supplyBefore - options.amount, "rETH supply delta was incorrect");
    assert.equal(rethAfter, rethBefore - options.amount, "Holder rETH balance delta was incorrect");
    assert.equal(
        ethAfter,
        ethBefore + expectedEth - transactionFee,
        "Holder ETH balance delta was incorrect",
    );
}
