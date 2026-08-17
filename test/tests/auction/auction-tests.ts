import assert from "assert";
import { parseEther } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import { before, describe, expectRevert, it, load } from "../../harness";
import {
    claimBidAndAssert,
    createLotAndAssert,
    placeBidAndAssert,
    recoverUnclaimedRplAndAssert,
} from "../../scenarios/auction/auction";
import { submitPricesScenario } from "../../scenarios/network/submit-prices";

const rpl = parseEther;
const AUCTION_DURATION = 7_200n;

describe("RocketAuctionManager", () => {
    before(async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.auctions.setLotDuration(AUCTION_DURATION);
        await current.nodes.register("trustedNode");
        await current.odao.members.bootstrap("trustedNode", {
            id: "saas_1",
            url: "node@home.com",
        });
    });

    it("rejects lot creation when the auction has insufficient RPL", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.auctions.createLot({ caller: "random1" }),
            "Insufficient RPL balance to create new lot",
        );
    });

    describe("with RPL available to auction", () => {
        before(async () => {
            const current = await load().ensure("current");
            await current.tokens.mintRpl("auctionFunder", rpl("1600"));
            await current.auctions.fundRpl("auctionFunder", rpl("1600"));
            assert.deepEqual(await current.auctions.balances(), {
                totalRpl: rpl("1600"),
                allottedRpl: 0n,
                remainingRpl: rpl("1600"),
            });
        });

        it("allows anyone to create multiple lots", async () => {
            const current = await load().ensure("current");
            await createLotAndAssert(current, { caller: "random1" });
            await createLotAndAssert(current, { caller: "random1" });
        });

        it("rejects lot creation while it is disabled", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.auctions.setLotCreationEnabled(false);
            await expectRevert(
                () => current.auctions.createLot({ caller: "random1" }),
                "Creating lots is currently disabled",
            );
        });

        it("calculates the quadratic lot price at any block", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.auctions.setLotDuration(100_000n);
            await current.pdao.settings.auctions.setStartingPriceRatio(rpl("1"));
            await current.pdao.settings.auctions.setReservePriceRatio(rpl("0.5"));
            const block = BigInt(await ethers.provider.getBlockNumber());
            await submitPricesScenario(current, {
                caller: "trustedNode",
                block,
                slotTimestamp: 1_600_000_000n,
                rplPrice: rpl("1"),
            });
            const index = await createLotAndAssert(current, { caller: "random1" });
            const startBlock = (await current.auctions.lot(index)).startBlock;
            const prices = [
                [0n, "1.00000"],
                [12_000n, "0.99280"],
                [25_000n, "0.96875"],
                [37_000n, "0.93155"],
                [50_000n, "0.87500"],
                [63_000n, "0.80155"],
                [75_000n, "0.71875"],
                [88_000n, "0.61280"],
                [100_000n, "0.50000"],
            ] as const;
            for (const [offset, expected] of prices) {
                assert.equal(await current.auctions.priceAtBlock(index, startBlock + offset), rpl(expected));
            }
        });

        it("accepts repeated bids from multiple addresses across multiple lots", async () => {
            const current = await load().ensure("current");
            const first = await createLotAndAssert(current, { caller: "random1" });
            const second = await createLotAndAssert(current, { caller: "random1" });
            await placeBidAndAssert(current, first, { caller: "random1", amount: rpl("4") });
            await placeBidAndAssert(current, first, { caller: "random1", amount: rpl("4") });
            await placeBidAndAssert(current, first, { caller: "random2", amount: rpl("4") });
            await placeBidAndAssert(current, second, { caller: "random1", amount: rpl("2") });
            await placeBidAndAssert(current, second, { caller: "random1", amount: rpl("2") });
            await placeBidAndAssert(current, second, { caller: "random2", amount: rpl("2") });
        });

        it("lets bidders claim RPL from cleared lots", async () => {
            const current = await load().ensure("current");
            const first = await createLotAndAssert(current, { caller: "random1" });
            const second = await createLotAndAssert(current, { caller: "random1" });
            await placeBidAndAssert(current, first, { caller: "random1", amount: rpl("5") });
            await placeBidAndAssert(current, first, { caller: "random2", amount: rpl("5") });
            await placeBidAndAssert(current, second, { caller: "random1", amount: rpl("3") });
            await placeBidAndAssert(current, second, { caller: "random2", amount: rpl("3") });
            await claimBidAndAssert(current, first, { caller: "random1" });
            await claimBidAndAssert(current, first, { caller: "random2" });
            await claimBidAndAssert(current, second, { caller: "random1" });
            await claimBidAndAssert(current, second, { caller: "random2" });
        });

        it("recovers unclaimed RPL from expired lots", async () => {
            const current = await load().ensure("current");
            const first = await createLotAndAssert(current, { caller: "random1" });
            const second = await createLotAndAssert(current, { caller: "random1" });
            await current.time.mineBlocks(AUCTION_DURATION);
            await recoverUnclaimedRplAndAssert(current, first, { caller: "random1" });
            await recoverUnclaimedRplAndAssert(current, second, { caller: "random1" });
        });

        describe("with an existing lot", () => {
            let lot: bigint;

            before(async () => {
                const current = await load().ensure("current");
                lot = await createLotAndAssert(current, { caller: "random1" });
            });

            it("rejects recovery when a cleared lot has no unclaimed RPL", async () => {
                const current = await load().ensure("current");
                await placeBidAndAssert(current, lot, { caller: "random1", amount: rpl("1000") });
                await current.time.mineBlocks(AUCTION_DURATION);
                await expectRevert(
                    () => current.auctions.recoverUnclaimedRpl(lot, { caller: "random1" }),
                    "No unclaimed RPL is available to recover",
                );
            });

            it("rejects bids on a lot that does not exist", async () => {
                const current = await load().ensure("current");
                await expectRevert(
                    () => current.auctions.placeBid(lot + 1n, rpl("4"), { caller: "random1" }),
                    "Lot does not exist",
                );
            });

            it("rejects bids while bidding is disabled", async () => {
                const current = await load().ensure("current");
                await current.pdao.settings.auctions.setBiddingEnabled(false);
                await expectRevert(
                    () => current.auctions.placeBid(lot, rpl("4"), { caller: "random1" }),
                    "Bidding on lots is currently disabled",
                );
            });

            it("rejects a zero-value bid", async () => {
                const current = await load().ensure("current");
                await expectRevert(
                    () => current.auctions.placeBid(lot, 0n, { caller: "random1" }),
                    "Invalid bid amount",
                );
            });

            it("rejects bids after the bidding period ends", async () => {
                const current = await load().ensure("current");
                await current.time.mineBlocks(AUCTION_DURATION);
                await expectRevert(
                    () => current.auctions.placeBid(lot, rpl("4"), { caller: "random1" }),
                    "Lot bidding period has concluded",
                );
            });

            it("rejects bids after the RPL allocation is exhausted", async () => {
                const current = await load().ensure("current");
                await placeBidAndAssert(current, lot, { caller: "random1", amount: rpl("1000") });
                await expectRevert(
                    () => current.auctions.placeBid(lot, rpl("4"), { caller: "random2" }),
                    "Lot RPL allocation has been exhausted",
                );
            });

            it("rejects claims against a lot that does not exist", async () => {
                const current = await load().ensure("current");
                await placeBidAndAssert(current, lot, { caller: "random1", amount: rpl("1000") });
                await expectRevert(
                    () => current.auctions.claimBid(lot + 1n, { caller: "random1" }),
                    "Lot does not exist",
                );
            });

            it("rejects claims before a lot clears", async () => {
                const current = await load().ensure("current");
                await placeBidAndAssert(current, lot, { caller: "random1", amount: rpl("4") });
                await expectRevert(
                    () => current.auctions.claimBid(lot, { caller: "random1" }),
                    "Lot has not cleared yet",
                );
            });

            it("rejects claims from an address that did not bid", async () => {
                const current = await load().ensure("current");
                await placeBidAndAssert(current, lot, { caller: "random1", amount: rpl("1000") });
                await expectRevert(
                    () => current.auctions.claimBid(lot, { caller: "random2" }),
                    "Address has no RPL to claim",
                );
            });

            it("rejects recovery from a lot that does not exist", async () => {
                const current = await load().ensure("current");
                await current.time.mineBlocks(AUCTION_DURATION);
                await expectRevert(
                    () => current.auctions.recoverUnclaimedRpl(lot + 1n, { caller: "random1" }),
                    "Lot does not exist",
                );
            });

            it("rejects recovery before the bidding period ends", async () => {
                const current = await load().ensure("current");
                await expectRevert(
                    () => current.auctions.recoverUnclaimedRpl(lot, { caller: "random1" }),
                    "Lot bidding period has not concluded yet",
                );
            });

            it("rejects recovering unclaimed RPL twice", async () => {
                const current = await load().ensure("current");
                await current.time.mineBlocks(AUCTION_DURATION);
                await recoverUnclaimedRplAndAssert(current, lot, { caller: "random1" });
                await expectRevert(
                    () => current.auctions.recoverUnclaimedRpl(lot, { caller: "random1" }),
                    "Unclaimed RPL has already been recovered from the lot",
                );
            });
        });
    });
});
