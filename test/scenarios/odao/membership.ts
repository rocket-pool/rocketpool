import assert from "assert";

import type { ProtocolView } from "../../harness";

export async function bootstrapODAOInviteAndAssert(
    protocol: ProtocolView,
    member: string,
    options: { id: string; url: string; caller?: string },
): Promise<void> {
    await protocol.odao.members.bootstrapInvite(member, options);
    assert.equal(await protocol.odao.members.id(member), options.id);
    assert.equal(await protocol.odao.members.isValid(member), false);
}

export async function joinODAOMemberAndAssert(
    protocol: ProtocolView,
    member: string,
    options: { prepareBond?: boolean } = {},
): Promise<void> {
    if (options.prepareBond ?? true) await protocol.odao.members.prepareBond(member);
    const token = protocol.contracts.rocketTokenRPL;
    const tokenAddress = await token.getAddress();
    const [countBefore, memberBalanceBefore, vaultBefore] = await Promise.all([
        protocol.odao.members.count(),
        token.balanceOf(await protocol.nodes.address(member)),
        protocol.contracts.rocketVault.balanceOfToken("rocketDAONodeTrustedActions", tokenAddress),
    ]);
    await protocol.odao.members.join(member);
    const bond = await protocol.odao.members.bond(member);
    assert.equal(await protocol.odao.members.count(), countBefore + 1n);
    assert.equal(await protocol.odao.members.isValid(member), true);
    assert.equal(await token.balanceOf(await protocol.nodes.address(member)), memberBalanceBefore - bond);
    assert.equal(
        await protocol.contracts.rocketVault.balanceOfToken("rocketDAONodeTrustedActions", tokenAddress),
        vaultBefore + bond,
    );
}

export async function joinRequiredODAOMemberAndAssert(
    protocol: ProtocolView,
    member: string,
    options: { id: string; url: string; prepareBond?: boolean },
): Promise<void> {
    if (options.prepareBond ?? true) await protocol.odao.members.prepareBond(member);
    const countBefore = await protocol.odao.members.count();
    await protocol.odao.members.joinRequired(member, options);
    assert.equal(await protocol.odao.members.count(), countBefore + 1n);
    assert.equal(await protocol.odao.members.isValid(member), true);
    assert.equal(await protocol.odao.members.id(member), options.id);
}

export async function disableODAOBootstrapAndAssert(protocol: ProtocolView): Promise<void> {
    await protocol.odao.bootstrap.disable();
    assert.equal(await protocol.odao.bootstrap.disabled(), true);
}
