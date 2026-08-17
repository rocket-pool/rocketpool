import type { ProtocolCurrent } from "../../harness";
import { load } from "../../harness";

export const ETHER = 10n ** 18n;
export const DEFAULT_BOND = 4n * ETHER;

export async function prepareMegapoolProtocol(): Promise<ProtocolCurrent> {
    const current = await load().ensure("current");
    for (const actor of ["node", "node2", "trusted1", "trusted2", "trusted3"]) {
        await current.nodes.register(actor);
    }
    await current.nodes.setWithdrawalAddress("node", "nodeWithdrawal", { confirm: true });
    for (const trusted of ["trusted1", "trusted2", "trusted3"]) {
        await current.odao.members.bootstrap(trusted, {
            id: `${trusted}-id`,
            url: `${trusted}@home.com`,
        });
    }
    await current.megapools.disableProofVerification();
    await current.pdao.settings.megapools.setUint("user.distribute.delay", 1_575n);
    return current;
}

export async function depositAndAssign(
    current: ProtocolCurrent,
    count = 1,
    bond = DEFAULT_BOND,
): Promise<void> {
    await current.depositPool.fund("depositor", (32n * ETHER - bond) * BigInt(count));
    for (let index = 0; index < count; index++) {
        await current.megapools.deposit("node", { bond });
    }
}
