import assert from "assert";
import { parseEther } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import { depositAndAssert } from "../../scenarios/deposit/deposit";
import { before, describe, expectRevert, it, load } from "../../harness";
import type { ProtocolCurrent } from "../../harness";
import { depositMegapoolValidatorScenario } from "../../scenarios/megapool/deposit-validator";
import { submitBalancesScenario } from "../../scenarios/network/submit-balances";
import { burnRethAndAssert } from "../../scenarios/token/burn-reth";
import { transferRethAndAssert } from "../../scenarios/token/transfer-reth";

const SLOT_TIMESTAMP = 1_600_000_000n;

async function submitCollateralBalances(current: ProtocolCurrent): Promise<void> {
    const balances = await current.network.balances.details();
    const submissionBlock = balances.block + 1n;
    assert(submissionBlock < BigInt(await ethers.provider.getBlockNumber()));
    await submitBalancesScenario(current, {
        caller: "trustedNode",
        block: submissionBlock,
        slotTimestamp: SLOT_TIMESTAMP,
        totalEth: parseEther("28"),
        stakingEth: parseEther("28"),
        rethSupply: await current.tokens.rethSupply(),
    });
}

describe("RocketTokenRETH", () => {
    before(async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.network.setRethCollateralTarget(0n);
        await current.pdao.settings.deposits.setFee(parseEther("0.005"));
    });

    it("transfers rETH after a deposit", async () => {
        const current = await load().ensure("current");
        await depositAndAssert(current, { depositor: "staker1", amount: parseEther("20") });
        const rethBalance = await current.tokens.rethBalance("staker1");
        assert(rethBalance > 0n);

        await transferRethAndAssert(current, {
            from: "staker1",
            to: "random",
            amount: rethBalance,
        });
    });

    it("transfers received rETH", async () => {
        const current = await load().ensure("current");
        await depositAndAssert(current, { depositor: "staker1", amount: parseEther("20") });
        const rethBalance = await current.tokens.rethBalance("staker1");
        assert(rethBalance > 0n);

        await transferRethAndAssert(current, {
            from: "staker1",
            to: "random",
            amount: rethBalance,
        });
        await transferRethAndAssert(current, {
            from: "random",
            to: "staker1",
            amount: rethBalance,
        });
    });

    it("burns rETH for ETH collateral", async () => {
        const current = await load().ensure("current");
        await depositAndAssert(current, { depositor: "staker1", amount: parseEther("20") });
        const rethBalance = await current.tokens.rethBalance("staker1");

        await burnRethAndAssert(current, { holder: "staker1", amount: rethBalance });
    });

    it("rejects invalid rETH burn amounts", async () => {
        const current = await load().ensure("current");
        await depositAndAssert(current, { depositor: "staker1", amount: parseEther("20") });
        const rethBalance = await current.tokens.rethBalance("staker1");
        const excess = parseEther("100");
        assert(excess > rethBalance);

        await expectRevert(
            () => current.tokens.burnReth("staker1", 0n),
            "Invalid token burn amount",
        );
        await expectRevert(
            () => current.tokens.burnReth("staker1", excess),
            "Insufficient rETH balance",
        );
    });

    it("deposits excess rETH collateral into the deposit pool", async () => {
        const context = load();
        const current = await context.ensure("current");
        const random = await context.actor("random");
        const amount = parseEther("32");
        const [rethBefore, excessBefore] = await Promise.all([
            current.tokens.rethContractBalance(),
            current.depositPool.excessBalance(),
        ]);

        await (await random.sendTransaction({
            to: await current.contracts.rocketTokenRETH.getAddress(),
            value: amount,
        })).wait();
        assert.equal(await current.tokens.rethContractBalance(), rethBefore + amount);

        await current.tokens.depositExcessRethCollateral("random");

        assert.equal(await current.tokens.rethContractBalance(), rethBefore);
        assert.equal(await current.depositPool.excessBalance(), excessBefore + amount);
        assert.equal(await current.tokens.rethCollateralRate(), parseEther("1"));
    });

    describe("with a megapool validator deposit", () => {
        before(async () => {
            const current = await load().ensure("current");
            await depositAndAssert(current, { depositor: "staker1", amount: parseEther("28") });
            await current.nodes.register("trustedNode");
            await current.odao.members.bootstrap("trustedNode", {
                id: "saas_1",
                url: "node@home.com",
            });
            await current.nodes.register("node");
            await depositMegapoolValidatorScenario(current, "node");
        });

        it("burns rETH using excess deposit pool ETH", async () => {
            const current = await load().ensure("current");
            const rethBalance = await current.tokens.rethBalance("staker1");
            await depositAndAssert(current, { depositor: "staker2", amount: parseEther("28") });
            assert.equal(await current.depositPool.excessBalance(), parseEther("28"));

            await burnRethAndAssert(current, { holder: "staker1", amount: rethBalance });
        });

        it("routes a deposit below the collateral target to the rETH contract", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.network.setRethCollateralTarget(parseEther("0.1"));
            await submitCollateralBalances(current);
            const [rethBefore, poolBefore] = await Promise.all([
                current.tokens.rethContractBalance(),
                current.depositPool.balances(),
            ]);

            await current.depositPool.deposit("staker2", parseEther("1"));

            assert.equal(await current.tokens.rethContractBalance(), rethBefore + parseEther("1"));
            assert.equal((await current.depositPool.balances()).total, poolBefore.total);
        });

        it("routes only collateral-target excess into the deposit pool", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.network.setRethCollateralTarget(parseEther("0.1"));
            await submitCollateralBalances(current);
            const [rethBefore, poolBefore] = await Promise.all([
                current.tokens.rethContractBalance(),
                current.depositPool.balances(),
            ]);

            await current.depositPool.deposit("staker2", parseEther("56"));

            assert.equal(await current.tokens.rethContractBalance(), rethBefore + parseEther("2.8"));
            assert.equal(
                (await current.depositPool.balances()).total,
                poolBefore.total + parseEther("53.2"),
            );
        });

        it("rejects burns when available ETH collateral is insufficient", async () => {
            const current = await load().ensure("current");
            const rethBalance = await current.tokens.rethBalance("staker1");
            await expectRevert(
                () => current.tokens.burnReth("staker1", rethBalance),
                "Insufficient ETH balance for exchange",
            );

            await depositAndAssert(current, { depositor: "staker2", amount: parseEther("10") });
            assert.equal(await current.depositPool.excessBalance(), parseEther("10"));
            await expectRevert(
                () => current.tokens.burnReth("staker1", rethBalance),
                "Insufficient ETH balance for exchange",
            );
        });
    });
});
