import assert from "node:assert/strict";
import { MaxUint256, parseEther } from "ethers";
import { asNetworkContract, before, describe, expectRevert, it, load } from "../../harness";
import { assertRequestedExitIndex } from "../../scenarios/network/requested-exits";
import { stakeMegapoolValidatorAndAssert } from "../../scenarios/megapool/stake-validator";
import { notifyMegapoolExitAndAssert } from "../../scenarios/megapool/notify-exit";
import { finaliseMegapoolValidatorAndAssert } from "../../scenarios/megapool/finalise-validator";
import { distributeMinipoolBalanceAndAssert } from "../../scenarios/minipool/distribute-balance";
import { currentEpoch } from "../../scenarios/megapool/proofs";
import { ethers } from "../../../test-old/_utils/hardhat-runtime";

describe("RocketNetworkExit mixed request enumeration", () => {
    before(async () => {
        const old = await load().ensure("1.3.1");
        await old.nodes.register("legacyNode");
        await old.nodes.stakeMinimumRpl("legacyNode", { minipools: 1, bond: parseEther("16") });
        await old.depositPool.fund("depositor", parseEther("16"));
        await old.minipools.create("pool", { node: "legacyNode", bond: parseEther("16") });
        await old.time.advanceMinipoolScrubPeriod();
        await old.minipools.stake("pool");
        const current = await old.upgradeTo("current");
        await current.nodes.register("node");
        await current.megapools.disableProofVerification();
        await current.depositPool.fund("depositor", parseEther("84"));
        for (let id = 0n; id < 3n; ++id) {
            await current.megapools.deposit("node");
            await stakeMegapoolValidatorAndAssert(current, "node", id);
        }
    });

    it("enumerates mixed requests, paginates, and removes reconciled entries by swapping the tail", async () => {
        const current = await load().ensure("current");
        const exit = current.contracts.rocketNetworkExit;
        const mini = current.minipools.get("pool").address;
        const mega = await current.megapools.address("node");
        assert.deepEqual(await assertRequestedExitIndex(current), []);
        await expectRevert(() => exit.getRequestedExitAt(0), "Index out of bounds");
        await asNetworkContract(current, "rocketNetworkRedemptions", async signer => {
            await (await exit.connect(signer).requestMinipoolExit(mini)).wait();
            await (await exit.connect(signer).requestMegapoolExit(mega, 0n)).wait();
            await (await exit.connect(signer).requestMegapoolExit(mega, 1n)).wait();
        });
        const original = [[mini, 0n, false], [mega, 0n, true], [mega, 1n, true]];
        assert.deepEqual(await assertRequestedExitIndex(current), original);
        const snapshotBlock = await ethers.provider.getBlockNumber();
        assert.deepEqual((await exit.getRequestedExits(0, 2)).map(e => Array.from(e)), original.slice(0, 2));
        assert.deepEqual((await exit.getRequestedExits(2, MaxUint256)).map(e => Array.from(e)), original.slice(2));
        assert.equal((await exit.getRequestedExits(0, 0)).length, 0);
        assert.equal((await exit.getRequestedExits(3, 1)).length, 0);
        assert.equal((await exit.getRequestedExits(MaxUint256, MaxUint256)).length, 0);
        await expectRevert(() => exit.getRequestedExitAt(3), "Index out of bounds");

        await asNetworkContract(current, "rocketNetworkRedemptions", async signer => {
            await expectRevert(() => exit.connect(signer).requestMinipoolExit(mini), "Minipool already requested to exit");
            await expectRevert(() => exit.connect(signer).requestMegapoolExit(mega, 0n), "Validator exit already tracked");
        });
        const epoch = await currentEpoch(current) + 114n;
        for (let id = 0n; id < 3n; ++id) await notifyMegapoolExitAndAssert(current, "node", id, epoch);
        // Validator 2 exits voluntarily; notification does not remove requested validators.
        assert.deepEqual(await assertRequestedExitIndex(current), original);
        await current.time.advance(114n * 32n * 12n);
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, parseEther("32"));
        assert.deepEqual(await assertRequestedExitIndex(current), [original[0], original[2]]);
        assert.deepEqual((await exit.getRequestedExits(0, MaxUint256, { blockTag: snapshotBlock })).map(e => Array.from(e)), original);
        await finaliseMegapoolValidatorAndAssert(current, "node", 2n, parseEther("32"));
        assert.deepEqual(await assertRequestedExitIndex(current), [original[0], original[2]]);

        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: parseEther("32"), expectedUser: parseEther("16"), expectedNode: parseEther("16"),
        });
        assert.deepEqual(await assertRequestedExitIndex(current), [original[0], original[2]]);
        await (await exit.connect(await current.context.actor("random")).settleMinipoolExit(mini)).wait();
        assert.deepEqual(await assertRequestedExitIndex(current), [original[2]]);
        await finaliseMegapoolValidatorAndAssert(current, "node", 1n, parseEther("32"));
        assert.deepEqual(await assertRequestedExitIndex(current), []);
        await expectRevert(() => exit.getRequestedExitAt(0), "Index out of bounds");
    });
});
