import assert from "assert";

import type { ProtocolView } from "../../harness";

export async function mintFixedSupplyRplAndAssert(
    protocol: ProtocolView,
    options: { holder: string; amount: bigint },
): Promise<void> {
    const fixedSupply = protocol.contracts.rocketTokenRPLFixedSupply;
    const holderAddress = await protocol.nodes.address(options.holder);
    const [supplyBefore, balanceBefore] = await Promise.all([
        fixedSupply.totalSupply(),
        fixedSupply.balanceOf(holderAddress),
    ]);

    await protocol.tokens.mintFixedSupplyRpl(options.holder, options.amount);

    assert.equal(await fixedSupply.totalSupply(), supplyBefore + options.amount);
    assert.equal(await fixedSupply.balanceOf(holderAddress), balanceBefore + options.amount);
}

export async function approveFixedSupplyRplAndAssert(
    protocol: ProtocolView,
    options: { holder: string; amount: bigint },
): Promise<void> {
    const fixedSupply = protocol.contracts.rocketTokenRPLFixedSupply;
    const holderAddress = await protocol.nodes.address(options.holder);
    const rplAddress = await protocol.contracts.rocketTokenRPL.getAddress();

    await protocol.tokens.approveFixedSupplyRpl(options.holder, options.amount);

    assert.equal(await fixedSupply.allowance(holderAddress, rplAddress), options.amount);
}

export async function swapFixedSupplyRplAndAssert(
    protocol: ProtocolView,
    options: { holder: string; amount: bigint },
): Promise<void> {
    const fixedSupply = protocol.contracts.rocketTokenRPLFixedSupply;
    const rpl = protocol.contracts.rocketTokenRPL;
    const holderAddress = await protocol.nodes.address(options.holder);
    const rplAddress = await rpl.getAddress();
    const before = await Promise.all([
        fixedSupply.balanceOf(holderAddress),
        fixedSupply.balanceOf(rplAddress),
        fixedSupply.allowance(holderAddress, rplAddress),
        rpl.totalSupply(),
        rpl.balanceOf(holderAddress),
        rpl.balanceOf(rplAddress),
        rpl.totalSwappedRPL(),
    ]);

    await protocol.tokens.swapFixedSupplyRpl(options.holder, options.amount);

    const after = await Promise.all([
        fixedSupply.balanceOf(holderAddress),
        fixedSupply.balanceOf(rplAddress),
        fixedSupply.allowance(holderAddress, rplAddress),
        rpl.totalSupply(),
        rpl.balanceOf(holderAddress),
        rpl.balanceOf(rplAddress),
        rpl.totalSwappedRPL(),
    ]);
    assert.equal(after[0], before[0] - options.amount, "Fixed-supply holder balance delta was incorrect");
    assert.equal(after[1], before[1] + options.amount, "Fixed-supply RPL received by the RPL contract was incorrect");
    assert.equal(after[2], before[2] - options.amount, "Fixed-supply allowance delta was incorrect");
    assert.equal(after[3], before[3], "RPL total supply changed during a fixed-supply swap");
    assert.equal(after[4], before[4] + options.amount, "Holder RPL balance delta was incorrect");
    assert.equal(after[5], before[5] - options.amount, "RPL reserve balance delta was incorrect");
    assert.equal(after[6], before[6] + options.amount, "Total swapped RPL delta was incorrect");
}
