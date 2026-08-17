import assert from "assert";

import { before, describe, expectRevert, it, load } from "../../harness";
import { applyMegapoolPenaltyVoteAndAssert } from "../../scenarios/megapool/apply-penalty";
import { exitMegapoolQueueAndAssert } from "../../scenarios/megapool/exit-queue";
import { withdrawMegapoolCreditAndAssert } from "../../scenarios/megapool/withdraw-credit";
import { DEFAULT_BOND, ETHER, prepareMegapoolProtocol } from "./fixtures";

describe("RocketMegapool deposit queue", () => {
    before(async () => {
        await prepareMegapoolProtocol();
    });

    it("exits the queue and withdraws part of the credit as rETH", async () => {
        const current = await load().ensure("current");
        await current.megapools.deposit("node");
        await exitMegapoolQueueAndAssert(current, "node", 0n);
        await withdrawMegapoolCreditAndAssert(current, "node", ETHER);
        await expectRevert(
            () => withdrawMegapoolCreditAndAssert(current, "node", DEFAULT_BOND),
            "Amount exceeds credit available",
        );
    });

    it("rejects withdrawing queue credit while debt exists", async () => {
        const current = await load().ensure("current");
        await current.megapools.deposit("node");
        await exitMegapoolQueueAndAssert(current, "node", 0n);
        await current.megapools.deploy("node").catch(() => undefined);
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, ETHER, "trusted1");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, ETHER, "trusted2");
        await expectRevert(
            () => withdrawMegapoolCreditAndAssert(current, "node", ETHER),
            "Cannot withdraw credit while debt exists",
        );
    });

    it("rejects leaving the same queue entry twice", async () => {
        const current = await load().ensure("current");
        await current.megapools.deposit("node");
        await exitMegapoolQueueAndAssert(current, "node", 0n);
        await expectRevert(() => current.megapools.dequeue("node", 0n), "Validator must be in queue");
    });

    it("queues and exits multiple validators", async () => {
        const current = await load().ensure("current");
        for (let index = 0n; index < 5n; index++) await current.megapools.deposit("node");
        assert.equal(await current.depositPool.queueLength(), 5n);
        for (let index = 0n; index < 5n; index++) await exitMegapoolQueueAndAssert(current, "node", index);
        assert.equal(await current.depositPool.queueLength(), 0n);
    });

    it("calculates positions across express and standard queues", async () => {
        const current = await load().ensure("current");
        await current.megapools.provisionExpressTickets("node", 2n);
        await current.megapools.provisionExpressTickets("node2", 2n);
        await current.megapools.depositMulti("node", [{}, { express: true }, { express: true }, {}, {}]);
        assert.deepEqual(
            await Promise.all([1n, 2n, 0n, 3n, 4n].map(id => current.megapools.queuePosition("node", id))),
            [0n, 1n, 2n, 3n, 4n],
        );

        await current.depositPool.fund("assignment-depositor", 32n * ETHER);
        assert.equal((await current.megapools.validator("node", 1n)).inPrestake, true);
        assert.equal(await current.megapools.queuePosition("node", 1n), null);
        assert.deepEqual(
            await Promise.all([2n, 0n, 3n, 4n].map(id => current.megapools.queuePosition("node", id))),
            [0n, 1n, 2n, 3n],
        );

        await current.pdao.settings.deposits.setAssignmentsEnabled(false);
        await current.megapools.deposit("node2", { express: true });
        await current.megapools.deposit("node2", { express: true });
        assert.deepEqual(
            await Promise.all([
                current.megapools.queuePosition("node", 2n),
                current.megapools.queuePosition("node2", 0n),
                current.megapools.queuePosition("node2", 1n),
                current.megapools.queuePosition("node", 0n),
                current.megapools.queuePosition("node", 3n),
                current.megapools.queuePosition("node", 4n),
            ]),
            [0n, 1n, 2n, 3n, 4n, 5n],
        );

        await current.pdao.settings.deposits.setAssignmentsEnabled(true);
        await current.depositPool.fund("second-assignment-depositor", 32n * ETHER);
        assert.deepEqual(
            await Promise.all([
                current.megapools.queuePosition("node2", 0n),
                current.megapools.queuePosition("node2", 1n),
                current.megapools.queuePosition("node", 0n),
                current.megapools.queuePosition("node", 3n),
                current.megapools.queuePosition("node", 4n),
            ]),
            [0n, 1n, 2n, 3n, 4n],
        );
    });

    describe("with a funded deposit pool", () => {
        before(async () => {
            const current = await load().ensure("current");
            await current.depositPool.fund("depositor", 320n * ETHER);
            await current.pdao.settings.megapools.setUint("megapool.time.before.dissolve", 10n * 24n * 60n * 60n);
        });

        it("assigns a queued validator after assignments are re-enabled", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.deposits.setAssignmentsEnabled(false);
            await current.megapools.deposit("node");
            assert.equal((await current.megapools.validator("node", 0n)).inQueue, true);
            await current.pdao.settings.deposits.setAssignmentsEnabled(true);
            await current.depositPool.assign(1n, { caller: "random" });
            assert.equal((await current.megapools.validator("node", 0n)).inQueue, false);
        });

        it("rejects leaving the queue after assignment", async () => {
            const current = await load().ensure("current");
            await current.megapools.deposit("node");
            await expectRevert(() => current.megapools.dequeue("node", 0n), "Validator must be in queue");
        });

        it("rejects creating a validator while debt exists", async () => {
            const current = await load().ensure("current");
            await current.megapools.deploy("node");
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, ETHER, "trusted1");
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, ETHER, "trusted2");
            await expectRevert(() => current.megapools.deposit("node"), "Cannot create validator while debt exists");
        });

        it("enforces the current bond requirement for each new validator", async () => {
            const current = await load().ensure("current");
            await expectRevert(() => current.megapools.deposit("node", { bond: 8n * ETHER }), "Bond requirement not met");
            await expectRevert(() => current.megapools.deposit("node", { bond: 2n * ETHER }), "Bond requirement not met");
            await current.megapools.deposit("node");
        });

        it("rejects consuming more express tickets than provisioned", async () => {
            const current = await load().ensure("current");
            await current.megapools.provisionExpressTickets("node", 2n);
            await current.megapools.deposit("node", { express: true });
            await current.megapools.deposit("node", { express: true });
            await expectRevert(() => current.megapools.deposit("node", { express: true }), "No express tickets");
        });

        it("creates a validator without an express ticket", async () => {
            await (await load().ensure("current")).megapools.deposit("node");
        });

        it("creates a validator with an express ticket", async () => {
            const current = await load().ensure("current");
            await current.megapools.provisionExpressTickets("node", 1n);
            await current.megapools.deposit("node", { express: true });
            assert.equal(await current.nodes.expressTicketCount("node"), 0n);
        });
    });
});
