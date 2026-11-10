import assert from "node:assert/strict";
import { before, describe, expectRevert, it, load } from "../../../harness";
import { RocketMegapoolDelegate__factory } from "../../../harness/bindings/current";
import { validatorProofArgs } from "../../../scenarios/megapool/proof-encoding";
import { currentSlot, slotProof, validatorProof } from "../../../scenarios/megapool/proofs";
import { dissolveMegapoolValidatorAndAssert } from "../../../scenarios/megapool/dissolve-validator";
import { stakeMegapoolValidatorAndAssert } from "../../../scenarios/megapool/stake-validator";

const ETHER = 10n ** 18n;
const PERIOD = 12n * 60n * 60n;

describe("v1.5 proofless staking upgrade", () => {
    before(async () => {
        const old = await load().ensure("1.4");
        await old.nodes.register("node");
        await old.nodes.register("oldDelegateNode");
        await old.depositPool.fund("depositor", 28n * ETHER);
        await old.megapools.deposit("node"); // Already prestaked; its signature has been deleted.
        await old.megapools.deposit("node"); // Queued with a signature, awaiting assignment.
        await old.megapools.deposit("oldDelegateNode"); // Will prestake through the old delegate.
    });

    it("enumerates legacy validators before and after their delegate upgrade", async () => {
        const old = await load().ensure("1.4");
        const current = await old.upgradeTo("current");
        const manager = current.contracts.rocketMegapoolManager;
        const address = await current.megapools.address("node");
        for (const index of [0n, 1n]) {
            const existing = await manager.getValidatorInfo(index);
            const prestake = await manager.getValidatorPrestakeInfo(index);
            assert.equal(prestake.megapool, address);
            assert.equal(prestake.validatorId, index);
            assert.equal(prestake.pubkey, existing.pubkey);
            assert.deepEqual(Array.from(prestake.validatorInfo), Array.from(existing.validatorInfo));
            assert.equal(prestake.signature, "0x");
            assert.equal(prestake.challengeDeadline, 0n);
        }
        await (await (await current.megapools.proxy("node", "node")).delegateUpgrade()).wait();
        const legacyPrestake = await manager.getValidatorPrestakeInfo(0n);
        assert.equal(legacyPrestake.validatorInfo.inPrestake, true);
        assert.equal(legacyPrestake.signature, "0x");
        assert.equal(legacyPrestake.challengeDeadline, 0n);
        const queued = await manager.getValidatorPrestakeInfo(1n);
        assert.equal(queued.validatorInfo.inQueue, true);
        assert.equal(queued.signature.length, 194);
        assert.equal(queued.challengeDeadline, 0n);
    });

    it("pages through legacy prestakes and reports expired delegates without blocking readable pools", async () => {
        const old = await load().ensure("1.4");
        const current = await old.upgradeTo("current");
        const manager = current.contracts.rocketMegapoolManager;
        const initial = await manager.getPrestakedValidatorIndices(0n, 3n);
        assert.deepEqual(Array.from(initial.indices), [0n]);
        assert.equal(initial.nextIndex, 3n);
        assert.deepEqual(Array.from(initial.failedIndices), []);
        const proxy = await current.megapools.proxy("node", "random");
        const expiry = await current.contracts.rocketMegapoolFactory.getDelegateExpiry(await proxy.getDelegate());
        // This megapool keeps a deprecated stored delegate but resolves to the latest without writing storage.
        await (await (await current.megapools.proxy("oldDelegateNode", "oldDelegateNode")).setUseLatestDelegate(true)).wait();
        await current.depositPool.fund("depositor", 56n * ETHER);
        await current.depositPool.assign(2n, { caller: "random" });
        await current.time.advance(expiry - await current.time.latest() + 1n);
        const expired = await manager.getPrestakedValidatorIndices(0n, 3n);
        assert.deepEqual(Array.from(expired.indices), [2n]);
        assert.deepEqual(Array.from(expired.failedIndices), [0n, 1n]);
        assert.equal(expired.nextIndex, 3n);
        await (await proxy.delegateUpgrade()).wait();
        const recovered = await manager.getPrestakedValidatorIndices(0n, 3n);
        assert.deepEqual(Array.from(recovered.indices), [0n, 1n, 2n]);
        assert.deepEqual(Array.from(recovered.failedIndices), []);
    });

    it("challenges legacy queued validators after upgrade but excludes deleted prestake signatures", async () => {
        const old = await load().ensure("1.4");
        const current = await old.upgradeTo("current");
        await (await (await current.megapools.proxy("node", "node")).delegateUpgrade()).wait();
        const manager = current.contracts.rocketMegapoolManager.connect(await current.context.actor("node"));
        const address = await current.megapools.address("node");
        const megapool = RocketMegapoolDelegate__factory.connect(address, await current.context.actor("node"));
        assert.equal(await megapool.getReservedPrestakeBond(), 0n);
        await expectRevert(() => manager.challengeInvalidSignature(address, 0n), "Prestake signature not retained");
        await expectRevert(() => manager.challengeInvalidSignature(address, 1n), "Validator not prestaked");
        await current.depositPool.fund("depositor", 56n * ETHER);
        await current.depositPool.assign(2n, { caller: "random" });
        assert.equal(await megapool.getReservedPrestakeBond(), 4n * ETHER);
        await (await manager.challengeInvalidSignature(address, 1n)).wait();
        assert.equal(await megapool.getReservedPrestakeBond(), 0n);
        assert.equal((await (await current.megapools.delegate("node")).getValidatorInfo(1n)).dissolved, true);
        assert.equal(await current.contracts.rocketDepositPool.getNodeCreditBalance(await current.nodes.address("node")), 3n * ETHER);
        await (await (await current.megapools.proxy("oldDelegateNode", "oldDelegateNode")).delegateUpgrade()).wait();
        const legacyAddress = await current.megapools.address("oldDelegateNode");
        await expectRevert(() => manager.challengeInvalidSignature(legacyAddress, 0n), "Prestake signature not retained");
    });

    it("preserves storage, admits existing queued validators and excludes legacy prestakes", async () => {
        const old = await load().ensure("1.4");
        const oldPool = await old.megapools.delegate("node");
        assert.equal(await oldPool.version(), 1n);
        const validatorStates = await Promise.all([0n, 1n].map(async i => Array.from(await oldPool.getValidatorInfo(i))));
        const balances = await Promise.all([oldPool.getNodeBond(), oldPool.getUserCapital(), oldPool.getNodeQueuedBond(), oldPool.getUserQueuedCapital(), oldPool.getAssignedValue(), oldPool.getDebt()]);
        const pubkeys = await Promise.all([oldPool.getValidatorPubkey(0n), oldPool.getValidatorPubkey(1n)]);
        const current = await old.upgradeTo("current");
        await (await (await current.megapools.proxy("node", "node")).delegateUpgrade()).wait();
        const megapool = RocketMegapoolDelegate__factory.connect(await current.megapools.address("node"), await current.context.actor("random"));
        assert.equal(await megapool.version(), 2n);
        assert.equal(await megapool.getReservedPrestakeBond(), 0n);
        assert.deepEqual(await Promise.all([0n, 1n].map(async i => Array.from(await megapool.getValidatorInfo(i)))), validatorStates);
        assert.deepEqual(await Promise.all([megapool.getNodeBond(), megapool.getUserCapital(), megapool.getNodeQueuedBond(), megapool.getUserQueuedCapital(), megapool.getAssignedValue(), megapool.getDebt()]), balances);
        assert.deepEqual(await Promise.all([megapool.getValidatorPubkey(0n), megapool.getValidatorPubkey(1n)]), pubkeys);
        assert.equal(await megapool.getValidatorPrestakeSignature(0n), "0x");
        assert.equal(await megapool.getValidatorChallengeDeadline(0n), 0n);
        const signature = await megapool.getValidatorPrestakeSignature(1n);
        assert.equal(signature.length, 194);
        await expectRevert(() => megapool.stakeWithoutProof(0n), "Prestake signature not retained");
        await expectRevert(() => megapool.stakeWithoutProof(1n), "Validator must be pre-staked");
        await current.depositPool.fund("depositor", 56n * ETHER);
        await current.depositPool.assign(2n, { caller: "random" });
        assert.equal(await megapool.getReservedPrestakeBond(), 4n * ETHER);
        assert.equal(await megapool.getValidatorPrestakeSignature(1n), signature);
        const info = await megapool.getValidatorInfo(1n);
        const deadline = await megapool.getValidatorChallengeDeadline(1n);
        assert.equal(deadline, info.lastAssignmentTime + PERIOD);
        // The other megapool did not upgrade before prestake, so upgrading now cannot restore eligibility.
        await (await (await current.megapools.proxy("oldDelegateNode", "oldDelegateNode")).delegateUpgrade()).wait();
        const legacy = RocketMegapoolDelegate__factory.connect(await current.megapools.address("oldDelegateNode"), await current.context.actor("random"));
        assert.equal((await legacy.getValidatorInfo(0n)).inPrestake, true);
        assert.equal(await legacy.getValidatorPrestakeSignature(0n), "0x");
        assert.equal(await legacy.getValidatorChallengeDeadline(0n), 0n);
        assert.equal(await legacy.getReservedPrestakeBond(), 0n);
        await current.time.advance(PERIOD);
        await (await megapool.stakeWithoutProof(1n)).wait();
        assert.equal(await megapool.getReservedPrestakeBond(), 0n);
        await expectRevert(() => megapool.stakeWithoutProof(0n), "Prestake signature not retained");
        await expectRevert(() => legacy.stakeWithoutProof(0n), "Prestake signature not retained");
        // Legacy validators retain their existing proof-based route.
        await current.megapools.disableProofVerification();
        await stakeMegapoolValidatorAndAssert(current, "node", 0n);
        await stakeMegapoolValidatorAndAssert(current, "oldDelegateNode", 0n);
        assert.equal(await megapool.getReservedPrestakeBond(), 0n);
        assert.equal(await legacy.getReservedPrestakeBond(), 0n);
    });

    it("resolves legacy prestakes without releasing a newer validator's reservation", async () => {
        const old = await load().ensure("1.4");
        const current = await old.upgradeTo("current");
        await (await (await current.megapools.proxy("node", "node")).delegateUpgrade()).wait();
        const megapool = RocketMegapoolDelegate__factory.connect(await current.megapools.address("node"), await current.context.actor("node"));
        await current.depositPool.fund("depositor", 28n * ETHER);
        await current.depositPool.assign(1n, { caller: "random" });
        assert.equal(await megapool.getReservedPrestakeBond(), 4n * ETHER);
        await current.time.advance(await current.pdao.settings.megapools.getTimeBeforeDissolve() + 1n);
        await (await megapool.dissolveValidator(0n)).wait();
        assert.equal(await megapool.getReservedPrestakeBond(), 4n * ETHER);
        assert.equal(await megapool.getNodeBond(), 4n * ETHER);
        await (await megapool.stakeWithoutProof(1n)).wait();
        assert.equal(await megapool.getReservedPrestakeBond(), 0n);
    });

    it("uses permissionless legacy proof settlement after upgrading the delegate", async () => {
        const old = await load().ensure("1.4");
        const current = await old.upgradeTo("current");
        await (await (await current.megapools.proxy("node", "node")).delegateUpgrade()).wait();
        const megapool = RocketMegapoolDelegate__factory.connect(await current.megapools.address("node"), await current.context.actor("node"));
        await current.depositPool.fund("depositor", 28n * ETHER);
        await current.depositPool.assign(1n, { caller: "random" });
        assert.equal(await megapool.getReservedPrestakeBond(), 4n * ETHER);
        const challenger = await current.nodes.address("node");
        const refundBefore = await megapool.getRefundValue();
        const creditBefore = await current.contracts.rocketDepositPool.getNodeCreditBalance(challenger);
        await expectRevert(() => megapool.dissolveValidator(0n), "Not enough time has passed");
        await current.megapools.disableProofVerification();
        await dissolveMegapoolValidatorAndAssert(current, "node", 0n, { caller: "random", proofOverrides: { slashed: true } });
        assert.equal((await megapool.getValidatorInfo(0n)).dissolved, true);
        assert.equal(await megapool.getAssignedValue(), 31n * ETHER);
        assert.equal(await megapool.getNodeBond(), 4n * ETHER);
        assert.equal(await megapool.getUserCapital(), 28n * ETHER);
        assert.equal(await megapool.getReservedPrestakeBond(), 4n * ETHER);
        assert.equal(await megapool.getRefundValue() - refundBefore, 3n * ETHER);
        assert.equal(await current.contracts.rocketDepositPool.getNodeCreditBalance(challenger), creditBefore);
        assert.equal(await megapool.getDebt(), await current.contracts.rocketDAOProtocolSettingsMegapool.getDissolvePenalty());
    });

    for (const mode of ["v1", "expired", "use latest"] as const) {
        it(`preserves legacy proof dissolution with a ${mode} delegate`, async () => {
            const old = await load().ensure("1.4");
            const oldPool = await old.megapools.delegate("node");
            const current = await old.upgradeTo("current");
            await current.megapools.disableProofVerification();
            const proxy = await current.megapools.proxy("node", "random");
            const oldDelegate = await proxy.getDelegate();
            assert.equal(await oldPool.version(), 1n);
            if (mode === "expired") {
                const invalid = await validatorProof(current, "node", 0n, { slashed: true });
                const manager = current.contracts.rocketMegapoolManager.connect(await current.context.actor("random"));
                const address = await current.megapools.address("node");
                const expiry = await current.contracts.rocketMegapoolFactory.getDelegateExpiry(oldDelegate);
                await current.time.advance(expiry - await current.time.latest() + 1n);
                // Manager view calls cannot perform the proxy's automatic storage-writing upgrade.
                const args = validatorProofArgs(address, 0n, await current.time.latest(), invalid, slotProof(await currentSlot(current)));
                await expectRevert(() => manager.dissolve(...args));
                assert.equal(await proxy.getDelegate(), oldDelegate);
                await (await proxy.delegateUpgrade()).wait();
            } else if (mode === "use latest") {
                await (await (await current.megapools.proxy("node", "node")).setUseLatestDelegate(true)).wait();
            }
            const megapool = RocketMegapoolDelegate__factory.connect(await current.megapools.address("node"), await current.context.actor("random"));
            assert.equal(await megapool.version(), mode === "v1" ? 1n : 2n);
            const random = await current.context.actorAddress("random");
            const creditBefore = await current.contracts.rocketDepositPool.getNodeCreditBalance(random);
            await dissolveMegapoolValidatorAndAssert(current, "node", 0n, { caller: "random", proofOverrides: { slashed: true } });
            assert.equal(await megapool.getRefundValue(), 3n * ETHER);
            assert.equal(await megapool.getNodeBond(), 0n);
            assert.equal(await megapool.getUserCapital(), 0n);
            assert.equal(await current.contracts.rocketDepositPool.getNodeCreditBalance(random), creditBefore);
            if (mode === "v1") assert.equal(await proxy.getDelegate(), oldDelegate);
        });
    }

});
