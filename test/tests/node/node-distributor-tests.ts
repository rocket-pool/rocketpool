import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import { distributeRewardsAndAssert } from "../../scenarios/node/distribute-rewards";
import { setWithdrawalAddressAndAssert } from "../../scenarios/node/set-withdrawal-address";

const ONE_ETHER = parseEther("1");
const HALF_ETHER = parseEther("0.5");

describe("RocketNodeDistributor", () => {
    before(async () => {
        const current = await load().ensure("current");
        await current.nodes.register("node1");
        await current.nodes.initialiseFeeDistributor("node1");
    });

    it("allows any actor to distribute rewards into the node's unclaimed balance", async () => {
        const current = await load().ensure("current");
        await current.distributors.fund("node1", "funder", ONE_ETHER);

        const result = await distributeRewardsAndAssert(current, {
            node: "node1",
            caller: "random",
        });

        assert.equal(result.averageFee, 0n);
        assert.equal(result.expectedNodeAmount, HALF_ETHER);
        assert.equal(result.expectedUserAmount, HALF_ETHER);
        assert.equal(result.withdrawalDelta, 0n);
        assert.equal(result.unclaimedDelta, HALF_ETHER);
    });

    it("prevents a node from manually adding unclaimed rewards", async () => {
        const current = await load().ensure("current");

        await expectRevert(
            () => current.nodes.addUnclaimedRewards("node1", ONE_ETHER),
            "Only distributor can add unclaimed rewards",
        );
    });

    it("distributes the node share directly when called by the node", async () => {
        const current = await load().ensure("current");
        await setWithdrawalAddressAndAssert(current, {
            node: "node1",
            withdrawalAddress: "node1WithdrawalAddress",
            confirm: true,
        });
        await current.distributors.fund("node1", "funder", ONE_ETHER);

        const result = await distributeRewardsAndAssert(current, {
            node: "node1",
            caller: "node1",
        });

        assert.equal(result.expectedNodeAmount, HALF_ETHER);
        assert.equal(result.withdrawalDelta, HALF_ETHER);
        assert.equal(result.unclaimedDelta, 0n);
    });

    describe("with unclaimed rewards and a reverting withdrawal receiver", () => {
        before(async () => {
            const ctx = load();
            const current = await ctx.ensure("current");
            const receiver = await ctx.fixtures.revertingReceiver.deploy("revertingWithdrawal");
            await receiver.setEnabled(true);
            await setWithdrawalAddressAndAssert(current, {
                node: "node1",
                withdrawalAddress: receiver.address,
                confirm: true,
            });
            await current.distributors.fund("node1", "funder", ONE_ETHER);
            const result = await distributeRewardsAndAssert(current, {
                node: "node1",
                caller: "random",
            });
            assert.equal(result.withdrawalDelta, 0n);
            assert.equal(result.unclaimedDelta, HALF_ETHER);
            await receiver.setEnabled(false);
        });

        it("lets the node operator claim unclaimed rewards", async () => {
            const ctx = load();
            const current = await ctx.ensure("current");
            const receiver = ctx.fixtures.revertingReceiver.get("revertingWithdrawal");
            const balanceBefore = await receiver.balance();

            await current.nodes.claimUnclaimedRewards("node1");

            assert.equal(await current.nodes.unclaimedRewards("node1"), 0n);
            assert.equal(await receiver.balance() - balanceBefore, HALF_ETHER);
        });

        it("prevents another actor from claiming the node's rewards", async () => {
            const current = await load().ensure("current");

            await expectRevert(
                () => current.nodes.claimUnclaimedRewards("node1", { caller: "random" }),
                "Only node can claim",
            );
        });
    });
});
