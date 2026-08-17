import assert from "assert";

import { before, describe, expectRevert, it, load } from "../../harness";
import { applyMegapoolPenaltyVoteAndAssert } from "../../scenarios/megapool/apply-penalty";
import { challengeMegapoolValidatorsAndAssert } from "../../scenarios/megapool/challenge-validator";
import { notifyMegapoolExitAndAssert } from "../../scenarios/megapool/notify-exit";
import { currentEpoch, currentSlot, slotProof, validatorProof } from "../../scenarios/megapool/proofs";
import { stakeMegapoolValidatorAndAssert } from "../../scenarios/megapool/stake-validator";
import { ETHER, prepareMegapoolProtocol } from "./fixtures";

describe("RocketMegapool penalties", () => {
    before(async () => {
        await prepareMegapoolProtocol();
    });

    it("applies a majority-approved penalty", async () => {
        const current = await load().ensure("current");
        await current.megapools.deploy("node");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, ETHER, "trusted1");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, ETHER, "trusted2");
        await expectRevert(
            () => applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, ETHER, "trusted3"),
            "Penalty already applied",
        );
    });

    it("rejects a majority penalty that exceeds the current maximum", async () => {
        const current = await load().ensure("current");
        const maximum = 2_500n * ETHER;
        await current.pdao.settings.megapools.setUint("maximum.megapool.eth.penalty", maximum);
        await current.megapools.deploy("node");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, maximum / 2n, "trusted1");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, maximum / 2n, "trusted2");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 1n, maximum / 2n + 1n, "trusted1");
        await expectRevert(
            () => applyMegapoolPenaltyVoteAndAssert(current, "node", 1n, maximum / 2n + 1n, "trusted2"),
            "Max penalty exceeded",
        );
    });

    it("replenishes the maximum penalty after seven days", async () => {
        const current = await load().ensure("current");
        const maximum = 2_500n * ETHER;
        await current.pdao.settings.megapools.setUint("maximum.megapool.eth.penalty", maximum);
        await current.megapools.deploy("node");
        for (const member of ["trusted1", "trusted2"]) {
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, maximum, member);
        }
        await current.time.advance(7n * 24n * 60n * 60n + 1n);
        for (const member of ["trusted1", "trusted2"]) {
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 1n, maximum, member);
        }
        assert.equal(await (await current.megapools.delegate("node")).getDebt(), maximum * 2n);
    });

    it("rejects voting for more than the configured maximum", async () => {
        const current = await load().ensure("current");
        const maximum = 2_500n * ETHER;
        await current.pdao.settings.megapools.setUint("maximum.megapool.eth.penalty", maximum);
        await current.megapools.deploy("node");
        await expectRevert(
            () => applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, maximum + 1n, "trusted1"),
            "Penalty exceeds maximum",
        );
    });
});

describe("RocketMegapool exit challenges", () => {
    before(async () => {
        const current = await prepareMegapoolProtocol();
        await current.depositPool.fund("depositor", 116n * ETHER);
        for (let index = 0n; index < 4n; index++) await current.megapools.deposit("node");
        for (let index = 0n; index < 3n; index++) await stakeMegapoolValidatorAndAssert(current, "node", index);
        await challengeMegapoolValidatorsAndAssert(current, "node", [0n], "trusted1");
        await current.megapools.sendRewards("node", "rewards", ETHER);
    });

    it("rejects a challenge from a random account", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => challengeMegapoolValidatorsAndAssert(current, "node", [1n], "random"),
            "Invalid trusted node",
        );
    });

    it("rejects a challenge from the node operator", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => challengeMegapoolValidatorsAndAssert(current, "node", [1n], "node"),
            "Invalid trusted node",
        );
    });

    it("rejects two consecutive challenges by one trusted member", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => challengeMegapoolValidatorsAndAssert(current, "node", [0n], "trusted1"),
            "Member was last to challenge",
        );
    });

    it("updates an existing challenge to a newer slot", async () => {
        const current = await load().ensure("current");
        const megapool = await current.megapools.delegate("node");
        const beforeSlot = (await megapool.getValidatorInfo(0n)).lockedTime;
        await current.time.advance(24n);
        await challengeMegapoolValidatorsAndAssert(current, "node", [0n], "trusted2");
        assert.equal((await megapool.getValidatorInfo(0n)).lockedTime > beforeSlot, true);
    });

    it("allows a different trusted member to repeat a challenge", async () => {
        await challengeMegapoolValidatorsAndAssert(await load().ensure("current"), "node", [0n], "trusted2");
    });

    it("challenges multiple staking validators at once", async () => {
        await challengeMegapoolValidatorsAndAssert(await load().ensure("current"), "node", [0n, 1n, 2n], "trusted2");
    });

    it("rejects challenging a non-staking validator", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => challengeMegapoolValidatorsAndAssert(current, "node", [3n], "trusted2"),
            "Validator not staked",
        );
    });

    it("rejects reward distribution while challenged", async () => {
        await expectRevert(
            async () => (await load().ensure("current")).megapools.distribute("node"),
            "Megapool locked",
        );
    });

    it("rejects proof-of-non-exit for a validator that is not locked", async () => {
        const current = await load().ensure("current");
        const timestamp = await current.time.latest();
        const slot = await currentSlot(current);
        await expectRevert(
            async () => current.contracts.rocketMegapoolManager.connect(await current.context.actor("proofSubmitter")).notifyNotExit(
                await current.megapools.address("node"),
                1n,
                timestamp,
                await validatorProof(current, "node", 1n),
                slotProof(slot),
            ),
            "Validator not locked",
        );
    });

    it("accepts valid proof-of-non-exit and unlocks distribution", async () => {
        const current = await load().ensure("current");
        const timestamp = await current.time.latest();
        const slot = await currentSlot(current);
        await (await current.contracts.rocketMegapoolManager.connect(await current.context.actor("proofSubmitter")).notifyNotExit(
            await current.megapools.address("node"),
            0n,
            timestamp,
            await validatorProof(current, "node", 0n),
            slotProof(slot),
        )).wait();
        assert.equal((await (await current.megapools.delegate("node")).getValidatorInfo(0n)).locked, false);
        await current.megapools.distribute("node");
    });

    it("unlocks a challenge when the validator exit is notified", async () => {
        const current = await load().ensure("current");
        await notifyMegapoolExitAndAssert(current, "node", 0n, await currentEpoch(current));
        assert.equal(await (await current.megapools.delegate("node")).getLockedValidatorCount(), 0n);
    });
});
