import assert from "assert";

import { before, describe, expectRevert, it, load } from "../../harness";
import { dissolveMegapoolValidatorAndAssert } from "../../scenarios/megapool/dissolve-validator";
import { notifyMegapoolExitAndAssert } from "../../scenarios/megapool/notify-exit";
import { currentEpoch, FAR_FUTURE_EPOCH, currentSlot, slotProof, validatorProof } from "../../scenarios/megapool/proofs";
import { stakeMegapoolValidatorAndAssert } from "../../scenarios/megapool/stake-validator";
import { ETHER, prepareMegapoolProtocol } from "./fixtures";

const DISSOLVE_PERIOD = 10n * 24n * 60n * 60n;

async function prepareAssigned(count = 1): Promise<void> {
    const current = await load().ensure("current");
    await current.depositPool.fund("depositor", 28n * ETHER * BigInt(count));
    for (let index = 0; index < count; index++) await current.megapools.deposit("node");
}

describe("RocketMegapool validator lifecycle", () => {
    before(async () => {
        const current = await prepareMegapoolProtocol();
        await current.pdao.settings.megapools.setUint("megapool.time.before.dissolve", DISSOLVE_PERIOD);
    });

    it("rejects dissolving a validator before the dissolve period", async () => {
        const current = await load().ensure("current");
        await prepareAssigned();
        await expectRevert(
            () => dissolveMegapoolValidatorAndAssert(current, "node", 0n, { caller: "random" }),
            "Not enough time has passed",
        );
    });

    it("allows permissionless dissolve after the dissolve period", async () => {
        const current = await load().ensure("current");
        await prepareAssigned();
        await current.time.advance(DISSOLVE_PERIOD + 1n);
        await dissolveMegapoolValidatorAndAssert(current, "node", 0n, { caller: "random" });
    });

    it("rejects exit notifications for a dissolved validator without changing state", async () => {
        const current = await load().ensure("current");
        await prepareAssigned();
        await current.time.advance(DISSOLVE_PERIOD + 1n);
        await dissolveMegapoolValidatorAndAssert(current, "node", 0n);
        const megapool = await current.megapools.delegate("node");
        const before = Array.from(await megapool.getValidatorInfo(0n));
        const debtBefore = await megapool.getDebt();
        const epoch = await currentEpoch(current);
        await expectRevert(
            () => notifyMegapoolExitAndAssert(current, "node", 0n, epoch),
            "Validator is dissolved",
        );
        assert.deepStrictEqual(Array.from(await megapool.getValidatorInfo(0n)), before);
        assert.equal(await megapool.getDebt(), debtBefore);
        assert.equal(await megapool.getExitingValidatorCount(), 0n);
        assert.equal(await megapool.getLockedValidatorCount(), 0n);
        assert.equal(await megapool.getActiveValidatorCount(), 0n);
    });

    it("stakes a later validator after an earlier validator is dissolved", async () => {
        const current = await load().ensure("current");
        await prepareAssigned(2);
        await current.time.advance(DISSOLVE_PERIOD + 1n);
        await dissolveMegapoolValidatorAndAssert(current, "node", 0n);
        await stakeMegapoolValidatorAndAssert(current, "node", 1n);
    });

    it("rejects exit proof with invalid withdrawal credentials", async () => {
        const current = await load().ensure("current");
        await prepareAssigned();
        await stakeMegapoolValidatorAndAssert(current, "node", 0n);
        const timestamp = await current.time.latest();
        const slot = await currentSlot(current);
        await expectRevert(
            async () => current.contracts.rocketMegapoolManager.connect(await current.context.actor("proofSubmitter")).notifyExit(
                await current.megapools.address("node"), 0n, timestamp,
                await validatorProof(current, "node", 0n, {
                    withdrawalCredentials: `0x${"11".repeat(32)}`,
                    withdrawableEpoch: await currentEpoch(current),
                }),
                slotProof(slot),
            ),
            "Invalid withdrawal credentials",
        );
    });

    it("immediately dissolves a provably invalid validator", async () => {
        const current = await load().ensure("current");
        await prepareAssigned();
        await dissolveMegapoolValidatorAndAssert(current, "node", 0n, {
            caller: "random",
            proofOverrides: { slashed: true },
        });
    });

    it("rejects immediate dissolve for a compliant validator", async () => {
        const current = await load().ensure("current");
        await prepareAssigned();
        await expectRevert(async () => {
            const signer = await current.context.actor("random");
            const timestamp = await current.time.latest();
            const slot = await currentSlot(current);
            return current.contracts.rocketMegapoolManager.connect(signer).dissolve(
                await current.megapools.address("node"), 0n, timestamp,
                await validatorProof(current, "node", 0n), slotProof(slot),
            );
        }, "Validator is compliant");
    });

    it("rejects immediate dissolve with a non-matching pubkey", async () => {
        const current = await load().ensure("current");
        await prepareAssigned();
        await expectRevert(
            () => dissolveMegapoolValidatorAndAssert(current, "node", 0n, {
                caller: "random", proofOverrides: { pubkey: `0x${"11".repeat(48)}`, slashed: true },
            }),
            "Pubkey does not match",
        );
    });

    const invalidDissolveCases = [
        ["withdrawal credentials", { withdrawalCredentials: `0x${"11".repeat(32)}` }],
        ["slashed status", { slashed: true }],
        ["withdrawable epoch", { withdrawableEpoch: 0n }],
        ["exit epoch", { exitEpoch: 0n }],
        ["activation eligibility epoch", { activationEligibilityEpoch: 0n }],
        ["activation epoch", { activationEpoch: 0n }],
        ["effective balance", { effectiveBalance: 33_000_000_000n }],
    ] as const;
    for (const [label, overrides] of invalidDissolveCases) {
        it(`immediately dissolves a validator with invalid ${label}`, async () => {
            const current = await load().ensure("current");
            await prepareAssigned();
            await dissolveMegapoolValidatorAndAssert(current, "node", 0n, {
                caller: "random", proofOverrides: overrides,
            });
        });
    }

    it("allows the node to stake a prestake validator", async () => {
        const current = await load().ensure("current");
        await prepareAssigned();
        await stakeMegapoolValidatorAndAssert(current, "node", 0n, "node");
    });

    it("allows a random account to submit a valid stake proof", async () => {
        const current = await load().ensure("current");
        await prepareAssigned();
        await stakeMegapoolValidatorAndAssert(current, "node", 0n, "random");
    });

    const invalidStakeCases = [
        ["withdrawal credentials", { withdrawalCredentials: `0x${"11".repeat(32)}` }],
        ["withdrawable epoch", { withdrawableEpoch: 0n }],
        ["exit epoch", { exitEpoch: 0n }],
        ["activation eligibility epoch", { activationEligibilityEpoch: 0n }],
        ["activation epoch", { activationEpoch: 0n }],
        ["slashed status", { slashed: true }],
        ["effective balance", { effectiveBalance: 32_000_000_000n }],
    ] as const;
    for (const [label, overrides] of invalidStakeCases) {
        it(`rejects staking a validator with invalid ${label}`, async () => {
            const current = await load().ensure("current");
            await prepareAssigned();
            const timestamp = await current.time.latest();
            const slot = await currentSlot(current);
            await expectRevert(async () => current.contracts.rocketMegapoolManager.connect(await current.context.actor("proofSubmitter")).stake(
                await current.megapools.address("node"), 0n, timestamp,
                await validatorProof(current, "node", 0n, overrides), slotProof(slot),
            ));
        });
    }

    it("stakes a second validator when no rewards are pending", async () => {
        const current = await load().ensure("current");
        await prepareAssigned(2);
        await stakeMegapoolValidatorAndAssert(current, "node", 0n);
        await stakeMegapoolValidatorAndAssert(current, "node", 1n);
    });

    it("rejects staking an already-staking validator", async () => {
        const current = await load().ensure("current");
        await prepareAssigned();
        await stakeMegapoolValidatorAndAssert(current, "node", 0n);
        const timestamp = await current.time.latest();
        const slot = await currentSlot(current);
        await expectRevert(async () => current.contracts.rocketMegapoolManager.connect(await current.context.actor("proofSubmitter")).stake(
            await current.megapools.address("node"), 0n, timestamp,
            await validatorProof(current, "node", 0n), slotProof(slot),
        ), "Validator must be pre-staked");
    });
});
