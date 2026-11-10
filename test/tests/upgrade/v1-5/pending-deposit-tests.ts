import assert from "node:assert/strict";
import { before, describe, it, load } from "../../../harness";
import { RocketMegapoolDelegate__factory } from "../../../harness/bindings/current";
import { currentSlot } from "../../../scenarios/megapool/proofs";
import { depositDataRoot, encodePendingDepositProof, pendingDepositProof, signedPendingDeposit } from "../../../scenarios/megapool/pending-deposit-proof";

const ETHER = 10n ** 18n;

describe("v1.5 pending deposit proof compatibility", () => {
    before(async () => {
        const old = await load().ensure("1.4");
        await old.nodes.register("node");
        await old.megapools.deploy("node");
        await old.depositPool.fund("depositor", 28n * ETHER);
        const credentials = await (await old.megapools.delegate("node")).getWithdrawalCredentials();
        const deposit = signedPendingDeposit(42n, credentials, 1_000_000_000n);
        await (await old.contracts.rocketNodeDeposit.connect(await old.context.actor("node")).deposit(
            4n * ETHER, false, deposit.pubkey, deposit.signature, depositDataRoot(deposit), { value: 4n * ETHER },
        )).wait();
    });

    for (const upgradeDelegate of [false, true]) {
        it(`retains permissionless unrewarded settlement for legacy prestakes on v${upgradeDelegate ? 2 : 1}`, async () => {
            const old = await load().ensure("1.4");
            const p = await old.upgradeTo("current");
            if (upgradeDelegate) await (await (await p.megapools.proxy("node", "node")).delegateUpgrade()).wait();
            const mp = RocketMegapoolDelegate__factory.connect(await p.megapools.address("node"), await p.context.actor("random"));
            assert.equal(await mp.version(), upgradeDelegate ? 2n : 1n);
            const proof = await pendingDepositProof(p, signedPendingDeposit(), { stateSlot: await currentSlot(p) - 20000n });
            const random = await p.context.actorAddress("random");
            const credit = await p.contracts.rocketDepositPool.getNodeCreditBalance(random);
            await (await p.contracts.rocketMegapoolManager.connect(await p.context.actor("random")).dissolvePendingDeposit(
                await mp.getAddress(), 0n, proof.timestamp, 1n, encodePendingDepositProof(proof),
            )).wait();
            assert.equal((await mp.getValidatorInfo(0n)).dissolved, true);
            assert.equal(await mp.getRefundValue(), 3n * ETHER);
            assert.equal(await mp.getNodeBond(), 0n);
            assert.equal(await mp.getUserCapital(), 0n);
            assert.equal(await p.contracts.rocketDepositPool.getNodeCreditBalance(random), credit);
        });
    }
});
