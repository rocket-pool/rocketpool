import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import { before, describe, expectRevert, it, load } from "../../harness";
import { applyMegapoolPenaltyVoteAndAssert } from "../../scenarios/megapool/apply-penalty";
import { distributeMegapoolRewardsAndAssert } from "../../scenarios/megapool/distribute-rewards";
import { finaliseMegapoolValidatorAndAssert } from "../../scenarios/megapool/finalise-validator";
import { notifyMegapoolExitAndAssert } from "../../scenarios/megapool/notify-exit";
import { currentEpoch, currentSlot, FAR_FUTURE_EPOCH } from "../../scenarios/megapool/proofs";
import { repayMegapoolDebtAndAssert } from "../../scenarios/megapool/repay-debt";
import { stakeMegapoolValidatorAndAssert } from "../../scenarios/megapool/stake-validator";
import { ETHER, prepareMegapoolProtocol } from "./fixtures";

const EXIT_WAIT = 114n;
const EPOCH_SECONDS = 32n * 12n;

async function prepareStaking(count = 1): Promise<void> {
    const current = await load().ensure("current");
    await current.depositPool.fund("depositor", 28n * ETHER * BigInt(count));
    for (let index = 0n; index < BigInt(count); index++) {
        await current.megapools.deposit("node");
        await stakeMegapoolValidatorAndAssert(current, "node", index);
    }
}

async function notifyAndWait(validatorId = 0n): Promise<void> {
    const current = await load().ensure("current");
    await notifyMegapoolExitAndAssert(current, "node", validatorId, await currentEpoch(current) + EXIT_WAIT);
    await current.time.advance(EXIT_WAIT * EPOCH_SECONDS);
}

describe("RocketMegapool validator exits and debt", () => {
    before(async () => {
        await prepareMegapoolProtocol();
    });

    it("rejects reward distribution after exit notification", async () => {
        const current = await load().ensure("current");
        await prepareStaking();
        await notifyMegapoolExitAndAssert(current, "node", 0n, await currentEpoch(current) + EXIT_WAIT);
        await expectRevert(() => current.megapools.distribute("node"), "Pending validator exit");
    });

    it("rejects exit notification with FAR_FUTURE withdrawable epoch", async () => {
        const current = await load().ensure("current");
        await prepareStaking();
        await expectRevert(
            () => notifyMegapoolExitAndAssert(current, "node", 0n, FAR_FUTURE_EPOCH),
            "Validator not exiting",
        );
    });

    it("rejects notifying the same exit twice", async () => {
        const current = await load().ensure("current");
        await prepareStaking();
        const epoch = await currentEpoch(current) + EXIT_WAIT;
        await notifyMegapoolExitAndAssert(current, "node", 0n, epoch);
        await expectRevert(() => notifyMegapoolExitAndAssert(current, "node", 0n, epoch), "Already notified");
    });

    it("rejects notifying final balance twice", async () => {
        const current = await load().ensure("current");
        await prepareStaking();
        await notifyAndWait();
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER);
        await expectRevert(
            () => finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER),
            "Already exited",
        );
    });

    it("rejects final balance proof for a mismatching validator", async () => {
        const current = await load().ensure("current");
        await prepareStaking(2);
        await notifyAndWait();
        await expectRevert(
            () => finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER, {
                withdrawalValidatorId: 1n,
            }),
            "Withdrawal validator not matching",
        );
    });

    it("rejects final balance before the withdrawal epoch", async () => {
        const current = await load().ensure("current");
        await prepareStaking();
        await notifyMegapoolExitAndAssert(current, "node", 0n, await currentEpoch(current) + EXIT_WAIT);
        const epoch = await currentEpoch(current);
        await expectRevert(
            () => finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER, {
                withdrawalSlot: (epoch - 1n) * 32n,
            }),
            "Not full withdrawal",
        );
    });

    it("rejects notifying exit on an exited validator", async () => {
        const current = await load().ensure("current");
        await prepareStaking();
        await notifyAndWait();
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER);
        await expectRevert(
            async () => notifyMegapoolExitAndAssert(current, "node", 0n, await currentEpoch(current)),
            "Already exited",
        );
    });

    for (const [label, penalty, expectedDebt] of [
        ["part", 8n * ETHER, 4n * ETHER],
        ["all", 3n * ETHER, 0n],
    ] as const) {
        it(`uses an exiting validator to repay ${label} of existing debt`, async () => {
            const current = await load().ensure("current");
            await prepareStaking();
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, penalty, "trusted1");
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, penalty, "trusted2");
            await notifyAndWait();
            await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER);
            assert.equal(await (await current.megapools.delegate("node")).getDebt(), expectedDebt);
        });
    }

    it("distributes rewards after one validator exits a multi-validator megapool", async () => {
        const current = await load().ensure("current");
        await prepareStaking(5);
        await notifyAndWait(0n);
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER);
        await current.megapools.sendRewards("node", "post-exit-rewards", ETHER);
        await distributeMegapoolRewardsAndAssert(current, "node");
    });

    it("rejects permissionless finalisation before the user delay", async () => {
        const current = await load().ensure("current");
        await prepareStaking(5);
        await notifyAndWait();
        await expectRevert(
            () => finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER, { caller: "random" }),
            "Not enough time has passed",
        );
    });

    it("allows permissionless finalisation after the user delay", async () => {
        const current = await load().ensure("current");
        await prepareStaking(5);
        await notifyAndWait();
        const withdrawalSlot = await currentSlot(current);
        await current.time.advance((await current.pdao.settings.megapools.getUserDistributeDelay() + 1n) * EPOCH_SECONDS);
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER, {
            caller: "random",
            withdrawalSlot,
            withdrawableEpoch: withdrawalSlot / 32n,
        });
        await current.megapools.sendRewards("node", "permissionless-rewards", ETHER);
        await distributeMegapoolRewardsAndAssert(current, "node", "random");
    });

    it("rejects immediate permissionless shortfall finalisation", async () => {
        const current = await load().ensure("current");
        await prepareStaking(5);
        await notifyAndWait();
        await expectRevert(
            () => finaliseMegapoolValidatorAndAssert(current, "node", 0n, 27n * ETHER, { caller: "random" }),
        );
    });

    it("rejects shortfall finalisation before the shortfall delay", async () => {
        const current = await load().ensure("current");
        await prepareStaking(5);
        await notifyAndWait();
        await current.time.advance((await current.pdao.settings.megapools.getUserDistributeDelay() + 1n) * EPOCH_SECONDS);
        await expectRevert(
            () => finaliseMegapoolValidatorAndAssert(current, "node", 0n, 27n * ETHER, { caller: "random" }),
        );
    });

    it("allows shortfall finalisation after the shortfall delay", async () => {
        const current = await load().ensure("current");
        await prepareStaking(5);
        await notifyAndWait();
        const withdrawalSlot = await currentSlot(current);
        await current.time.advance((await current.pdao.settings.megapools.getUserDistributeDelayWithShortfall() + 1n) * EPOCH_SECONDS);
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 27n * ETHER, {
            caller: "random",
            withdrawalSlot,
            withdrawableEpoch: withdrawalSlot / 32n,
        });
        await current.megapools.sendRewards("node", "shortfall-rewards", ETHER);
        await distributeMegapoolRewardsAndAssert(current, "node", "random");
    });

    for (const [label, balance] of [
        ["full balance", 32n * ETHER],
        ["short balance", 25n * ETHER],
    ] as const) {
        it(`reduces excess bond on exit with ${label}`, async () => {
            const current = await load().ensure("current");
            await prepareStaking(5);
            await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
            const withdrawalAddress = await current.nodes.withdrawalAddress("node");
            const balanceBefore = await ethers.provider.getBalance(withdrawalAddress);
            await notifyAndWait();
            await finaliseMegapoolValidatorAndAssert(current, "node", 0n, balance);
            const megapool = await current.megapools.delegate("node");
            assert.equal(await megapool.getNodeBond(), 12n * ETHER);
            assert.equal(
                await ethers.provider.getBalance(withdrawalAddress) - balanceBefore,
                balance === 32n * ETHER ? 8n * ETHER : ETHER,
            );
        });
    }

    it("accrues debt when exit balance is too low after bond reduction", async () => {
        const current = await load().ensure("current");
        await prepareStaking(5);
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await notifyAndWait();
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 23n * ETHER);
        const megapool = await current.megapools.delegate("node");
        assert.equal(await megapool.getNodeBond(), 12n * ETHER);
        assert.equal(await megapool.getRefundValue(), 0n);
        assert.equal(await megapool.getDebt(), ETHER);
    });

    it("accrues a late-notify debt penalty", async () => {
        const current = await load().ensure("current");
        await prepareStaking();
        const fine = ETHER / 100n;
        await current.pdao.settings.megapools.setUint("late.notify.fine", fine);
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        const epoch = await currentEpoch(current);
        const withdrawableEpoch = epoch + 111n;
        await notifyMegapoolExitAndAssert(current, "node", 0n, withdrawableEpoch);
        const megapool = await current.megapools.delegate("node");
        assert.equal(await megapool.getDebt(), fine);

        await current.time.advance(111n * EPOCH_SECONDS);
        await current.time.advance(
            (await current.pdao.settings.megapools.getUserDistributeDelay() + 1n) * EPOCH_SECONDS,
        );
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER, {
            caller: "random",
            withdrawalSlot: withdrawableEpoch * 32n,
            withdrawableEpoch,
        });
        assert.equal(await megapool.getDebt(), 0n);
    });

    describe("with debt", () => {
        before(async () => {
            const current = await load().ensure("current");
            await prepareStaking(5);
            await notifyAndWait(0n);
            await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 27n * ETHER);
            assert.equal(await (await current.megapools.delegate("node")).getDebt(), ETHER);
        });

        async function balances(): Promise<{
            debt: bigint;
            node: bigint;
            user: bigint;
        }> {
            const current = await load().ensure("current");
            const megapool = await current.megapools.delegate("node");
            const withdrawalAddress = await current.nodes.withdrawalAddress("node");
            return {
                debt: await megapool.getDebt(),
                node: await ethers.provider.getBalance(withdrawalAddress),
                user: await ethers.provider.getBalance(await current.contracts.rocketTokenRETH.getAddress())
                    + await current.contracts.rocketVault.balanceOf("rocketDepositPool"),
            };
        }

        it("manually repays part of debt", async () => {
            await repayMegapoolDebtAndAssert(await load().ensure("current"), "node", ETHER);
        });

        it("uses rewards to partially repay debt", async () => {
            const current = await load().ensure("current");
            await current.megapools.sendRewards("node", "rewards", ETHER);
            await distributeMegapoolRewardsAndAssert(current, "node");
        });

        it("uses rewards to fully repay debt", async () => {
            const current = await load().ensure("current");
            await current.megapools.sendRewards("node", "rewards", 20n * ETHER);
            await distributeMegapoolRewardsAndAssert(current, "node");
        });

        it("uses exit balance to repay debt", async () => {
            const current = await load().ensure("current");
            const before = await balances();
            await notifyAndWait(1n);
            await finaliseMegapoolValidatorAndAssert(current, "node", 1n, 32n * ETHER);
            const after = await balances();
            assert.equal(after.node - before.node, 3n * ETHER);
            assert.equal(after.debt, 0n);
            assert.equal(after.user - before.user, 29n * ETHER);
        });

        it("increases debt further on a slashed exit", async () => {
            const current = await load().ensure("current");
            const before = await balances();
            await notifyAndWait(1n);
            await finaliseMegapoolValidatorAndAssert(current, "node", 1n, 27n * ETHER);
            const after = await balances();
            assert.equal(after.node - before.node, 0n);
            assert.equal(after.debt - before.debt, ETHER);
            assert.equal(after.user - before.user, 27n * ETHER);
        });
    });
});
