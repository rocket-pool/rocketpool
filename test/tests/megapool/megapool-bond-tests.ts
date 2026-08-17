import assert from "assert";

import { before, describe, expectRevert, it, load } from "../../harness";
import { applyMegapoolPenaltyVoteAndAssert } from "../../scenarios/megapool/apply-penalty";
import { dissolveMegapoolValidatorAndAssert } from "../../scenarios/megapool/dissolve-validator";
import { exitMegapoolQueueAndAssert } from "../../scenarios/megapool/exit-queue";
import { finaliseMegapoolValidatorAndAssert } from "../../scenarios/megapool/finalise-validator";
import { notifyMegapoolExitAndAssert } from "../../scenarios/megapool/notify-exit";
import { currentEpoch } from "../../scenarios/megapool/proofs";
import { reduceMegapoolBondAndAssert } from "../../scenarios/megapool/reduce-bond";
import { stakeMegapoolValidatorAndAssert } from "../../scenarios/megapool/stake-validator";
import { withdrawMegapoolCreditAndAssert } from "../../scenarios/megapool/withdraw-credit";
import { ETHER, prepareMegapoolProtocol } from "./fixtures";

const DISSOLVE_PERIOD = 10n * 24n * 60n * 60n;
const EXIT_EPOCHS = 114n;
const EPOCH_SECONDS = 32n * 12n;

async function exitValidator(validatorId: bigint, balance = 32n * ETHER): Promise<void> {
    const current = await load().ensure("current");
    await notifyMegapoolExitAndAssert(
        current,
        "node",
        validatorId,
        await currentEpoch(current) + EXIT_EPOCHS,
    );
    await current.time.advance(EXIT_EPOCHS * EPOCH_SECONDS);
    await finaliseMegapoolValidatorAndAssert(current, "node", validatorId, balance);
}

async function prepareOverbonded(): Promise<void> {
    const current = await load().ensure("current");
    await current.depositPool.fund("depositor", 84n * ETHER);
    for (let index = 0n; index < 3n; index++) {
        await current.megapools.deposit("node");
        await stakeMegapoolValidatorAndAssert(current, "node", index);
    }
    await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
}

describe("RocketMegapool bond requirements", () => {
    before(async () => {
        const current = await prepareMegapoolProtocol();
        await current.pdao.settings.megapools.setUint("megapool.time.before.dissolve", DISSOLVE_PERIOD);
    });

    it("rejects reducing bond while validators remain queued", async () => {
        const current = await load().ensure("current");
        for (let validatorId = 0; validatorId < 3; validatorId++) {
            await current.megapools.deposit("node");
        }
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await expectRevert(() => current.megapools.reduceBond("node", ETHER), "Cannot reduce bond with queued validators");
    });

    it("rebalances active and queued bond as validators dissolve", async () => {
        const current = await load().ensure("current");
        await current.depositPool.fund("dissolve-rebalance-depositor", 40n * ETHER);
        for (let validatorId = 0n; validatorId < 24n; validatorId++) {
            await current.megapools.deposit("node");
        }
        const megapool = await current.megapools.delegate("node");
        assert.equal(await megapool.getNodeBond(), 16n * ETHER);
        assert.equal(await megapool.getNodeQueuedBond(), 80n * ETHER);

        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await current.depositPool.fund("dissolve-rebalance-depositor", 32n * ETHER);
        await current.time.advance(DISSOLVE_PERIOD + 1n);
        await dissolveMegapoolValidatorAndAssert(current, "node", 4n, { caller: "random" });
        assert.equal(await megapool.getNodeBond(), 0n);

        for (let validatorId = 5n; validatorId < 24n; validatorId++) {
            await current.depositPool.fund("dissolve-rebalance-depositor", 32n * ETHER);
            await current.time.advance(DISSOLVE_PERIOD + 1n);
            await dissolveMegapoolValidatorAndAssert(current, "node", validatorId, { caller: "random" });
        }
        assert.equal(await megapool.getNodeBond(), 12n * ETHER);
        assert.equal(await megapool.getNodeQueuedBond(), 0n);
        assert.equal(await megapool.getUserCapital(), 32n * ETHER * 4n - 12n * ETHER);
        assert.equal(await megapool.getUserQueuedCapital(), 0n);

        for (let validatorId = 0n; validatorId < 4n; validatorId++) {
            await stakeMegapoolValidatorAndAssert(current, "node", validatorId);
            await exitValidator(validatorId);
        }
        assert.equal(await megapool.getNodeBond(), 0n);
        assert.equal(await megapool.getUserCapital(), 0n);
    });

    it("allows a new validator when the bond requirement increases", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await current.pdao.settings.megapools.setDissolvePenalty(ETHER / 10n);
        await current.depositPool.fund("requirement-depositor", 20n * ETHER);
        await current.megapools.deposit("node");
        await current.megapools.deposit("node");
        await current.megapools.deposit("node", { bond: 2n * ETHER });
        await current.megapools.deposit("node", { bond: 2n * ETHER });
        await current.pdao.settings.nodes.setReducedBond(4n * ETHER);
        await expectRevert(
            () => current.megapools.deposit("node", { bond: 4n * ETHER }),
            "Bond requirement not met",
        );
        assert.equal(await (await current.megapools.delegate("node")).getNewValidatorBondRequirement(), 8n * ETHER);
        await current.megapools.deposit("node", { bond: 8n * ETHER });
    });

    it("caps catch-up bonds at 32 ETH when underbonded by more than 32 ETH", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await current.pdao.settings.deposits.setMaximumPoolSize(10_000n * ETHER);
        await current.pdao.settings.megapools.setDissolvePenalty(ETHER / 10n);
        await current.depositPool.fund("large-underbond-depositor", 30n * ETHER * 35n);
        await current.megapools.deposit("node");
        await current.megapools.deposit("node");
        for (let index = 0; index < 30; index++) {
            await current.megapools.deposit("node", { bond: 2n * ETHER });
        }
        const megapool = await current.megapools.delegate("node");
        assert.equal(await megapool.getNodeBond(), 68n * ETHER);
        assert.equal(await megapool.getUserCapital(), 32n * ETHER * 32n - 68n * ETHER);
        assert.equal(await megapool.getNodeQueuedBond(), 0n);
        assert.equal(await megapool.getUserQueuedCapital(), 0n);

        await current.pdao.settings.nodes.setReducedBond(4n * ETHER);
        assert.equal(await megapool.getNewValidatorBondRequirement(), 32n * ETHER);
        await current.megapools.deposit("node", { bond: 32n * ETHER });
        assert.equal(await megapool.getNodeBond(), 100n * ETHER);
        assert.equal(await megapool.getNewValidatorBondRequirement(), 32n * ETHER);
        await current.megapools.deposit("node", { bond: 32n * ETHER });
        assert.equal(await megapool.getNodeBond(), 132n * ETHER);
        assert.equal(await megapool.getNewValidatorBondRequirement(), 8n * ETHER);
        await current.megapools.deposit("node", { bond: 8n * ETHER });
    });

    it("dissolves and exits validators while the megapool is underbonded", async () => {
        const current = await load().ensure("current");
        const dissolvePenalty = ETHER / 10n;
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await current.pdao.settings.megapools.setDissolvePenalty(dissolvePenalty);
        await current.depositPool.fund("underbonded-depositor", 20n * ETHER);
        await current.megapools.deposit("node");
        await current.megapools.deposit("node");
        for (let index = 0; index < 52; index++) {
            await current.megapools.deposit("node", { bond: 2n * ETHER });
        }
        const megapool = await current.megapools.delegate("node");
        assert.equal(await megapool.getNodeBond(), 12n * ETHER);
        assert.equal(await megapool.getUserCapital(), 116n * ETHER);
        assert.equal(await megapool.getNodeQueuedBond(), 100n * ETHER);
        assert.equal(await megapool.getUserQueuedCapital(), 1_500n * ETHER);

        await current.pdao.settings.nodes.setReducedBond(4n * ETHER);
        await current.depositPool.fund("underbonded-depositor", 32n * ETHER * 15n);
        await current.time.advance(DISSOLVE_PERIOD + 1n);
        assert.equal(await megapool.getNodeBond(), 42n * ETHER);
        assert.equal(await megapool.getUserCapital(), 566n * ETHER);
        assert.equal(await megapool.getNodeQueuedBond(), 70n * ETHER);
        assert.equal(await megapool.getUserQueuedCapital(), 1_050n * ETHER);

        await current.pdao.settings.deposits.setAssignmentsEnabled(false);
        for (let validatorId = 4n; validatorId < 14n; validatorId++) {
            await dissolveMegapoolValidatorAndAssert(current, "node", validatorId, { caller: "random" });
        }
        assert.equal(await megapool.getNodeBond(), 42n * ETHER);
        assert.equal(await megapool.getUserCapital(), 246n * ETHER);
        assert.equal(await megapool.getNodeQueuedBond(), 70n * ETHER);
        assert.equal(await megapool.getUserQueuedCapital(), 1_050n * ETHER);
        assert.equal(await megapool.getDebt(), (dissolvePenalty + ETHER) * 10n);

        await current.pdao.settings.deposits.setAssignmentsEnabled(true);
        await current.pdao.settings.deposits.setMaximumPoolSize(10_000n * ETHER);
        for (let validatorId = 14n; validatorId < 54n; validatorId++) {
            await current.depositPool.fund("underbonded-depositor", 32n * ETHER);
            await current.time.advance(DISSOLVE_PERIOD + 1n);
            await stakeMegapoolValidatorAndAssert(current, "node", validatorId);
            await exitValidator(validatorId);
        }
        await current.time.advance(DISSOLVE_PERIOD + 1n);
        for (let validatorId = 0n; validatorId < 4n; validatorId++) {
            await stakeMegapoolValidatorAndAssert(current, "node", validatorId);
            await exitValidator(validatorId);
        }
        assert.equal(await megapool.getNodeBond(), 0n);
        assert.equal(await megapool.getUserCapital(), 0n);
    });

    it("rejects queue exit when dissolves would leave the megapool underbonded", async () => {
        const current = await load().ensure("current");
        await current.depositPool.fund("queue-underbond-depositor", 40n * ETHER);
        for (let index = 0; index < 24; index++) await current.megapools.deposit("node");
        const megapool = await current.megapools.delegate("node");
        assert.equal(await megapool.getNodeBond(), 16n * ETHER);
        assert.equal(await megapool.getNodeQueuedBond(), 80n * ETHER);
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await current.depositPool.fund("queue-underbond-depositor", 32n * ETHER);
        await current.time.advance(DISSOLVE_PERIOD + 1n);
        await dissolveMegapoolValidatorAndAssert(current, "node", 4n, { caller: "random" });
        assert.equal(await megapool.getNodeBond(), 0n);
        for (let validatorId = 5n; validatorId < 18n; validatorId++) {
            await exitMegapoolQueueAndAssert(current, "node", validatorId);
        }
        assert.equal(
            await current.contracts.rocketNodeDeposit.getBondRequirement(await megapool.getActiveValidatorCount()),
            24n * ETHER,
        );
        assert.equal(await megapool.getNodeQueuedBond(), 24n * ETHER);
        await expectRevert(() => current.megapools.dequeue("node", 18n), "Bond requirement not met");

        await stakeMegapoolValidatorAndAssert(current, "node", 0n);
        await exitValidator(0n);
        assert.equal(
            await current.contracts.rocketNodeDeposit.getBondRequirement(await megapool.getActiveValidatorCount()),
            22n * ETHER,
        );
        await exitMegapoolQueueAndAssert(current, "node", 18n);
        await current.pdao.settings.deposits.setAssignmentsEnabled(false);
        for (let validatorId = 1n; validatorId < 4n; validatorId++) {
            await stakeMegapoolValidatorAndAssert(current, "node", validatorId);
            await exitValidator(validatorId);
        }
        for (let validatorId = 19n; validatorId < 24n; validatorId++) {
            await exitMegapoolQueueAndAssert(current, "node", validatorId);
        }
        assert.equal(await current.contracts.rocketNodeDeposit.getBondRequirement(0n), 0n);
        assert.equal(await megapool.getNodeBond(), 0n);
        assert.equal(await megapool.getNodeQueuedBond(), 0n);
    });

    describe("with an overbonded megapool", () => {
        before(async () => {
            await prepareOverbonded();
        });

        it("rejects reducing below the current requirement", async () => {
            const current = await load().ensure("current");
            await expectRevert(() => current.megapools.reduceBond("node", 3n * ETHER), "New bond is too low");
        });

        it("partially reduces excess bond", async () => {
            await reduceMegapoolBondAndAssert(await load().ensure("current"), "node", ETHER);
        });

        it("rejects reducing bond while already at the minimum", async () => {
            const current = await load().ensure("current");
            const megapool = await current.megapools.delegate("node");
            const excess = await megapool.getNodeBond() - await current.contracts.rocketNodeDeposit.getBondRequirement(3n);
            if (excess > 0n) await current.megapools.reduceBond("node", excess);
            await expectRevert(() => current.megapools.reduceBond("node", 1n), "Bond is at minimum");
        });

        it("rejects reducing bond while debt exists", async () => {
            const current = await load().ensure("current");
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, ETHER, "trusted1");
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, ETHER, "trusted2");
            await expectRevert(() => current.megapools.reduceBond("node", ETHER), "Cannot reduce bond with debt");
        });

        it("uses reduced-bond credit for another validator", async () => {
            const current = await load().ensure("current");
            await reduceMegapoolBondAndAssert(current, "node", 2n * ETHER);
            await current.megapools.fundCredit("node", "creditFunder", 2n * ETHER);
            await current.megapools.deposit("node", { bond: 2n * ETHER, credit: 2n * ETHER });
        });

        it("uses reduced-bond credit to mint rETH", async () => {
            const current = await load().ensure("current");
            await reduceMegapoolBondAndAssert(current, "node", 2n * ETHER);
            await withdrawMegapoolCreditAndAssert(current, "node", 2n * ETHER);
        });

        it("only lets the node withdrawal address mint rETH for the node", async () => {
            const current = await load().ensure("current");
            await reduceMegapoolBondAndAssert(current, "node", 2n * ETHER);
            await expectRevert(
                () => withdrawMegapoolCreditAndAssert(current, "node", ETHER, "random"),
                "Must be called from withdrawal address",
            );
            await withdrawMegapoolCreditAndAssert(current, "node", ETHER, "nodeWithdrawal");
        });

        it("splits reduced-bond credit between rETH and another validator", async () => {
            const current = await load().ensure("current");
            await reduceMegapoolBondAndAssert(current, "node", 2n * ETHER);
            await withdrawMegapoolCreditAndAssert(current, "node", ETHER);
            await current.megapools.fundCredit("node", "creditFunder", ETHER);
            await current.megapools.deposit("node", { bond: 2n * ETHER, credit: ETHER });
        });
    });
});
