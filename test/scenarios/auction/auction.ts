import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolView } from "../../harness";

const ETHER = 10n ** 18n;

function minimum(left: bigint, right: bigint): bigint {
    return left < right ? left : right;
}

export async function createLotAndAssert(
    protocol: ProtocolView,
    options: { caller: string },
): Promise<bigint> {
    const settings = protocol.contracts.rocketDAOProtocolSettingsAuction;
    const [before, countBefore, maximumEthValue, duration, startRatio, reserveRatio, prices] = await Promise.all([
        protocol.auctions.balances(),
        protocol.auctions.lotCount(),
        settings.getLotMaximumEthValue(),
        settings.getLotDuration(),
        settings.getStartingPriceRatio(),
        settings.getReservePriceRatio(),
        protocol.network.prices.details(),
    ]);

    const index = await protocol.auctions.createLot(options);
    const [after, countAfter, lot] = await Promise.all([
        protocol.auctions.balances(),
        protocol.auctions.lotCount(),
        protocol.auctions.lot(index),
    ]);
    const maximumRpl = ETHER * maximumEthValue / prices.rplPrice;
    const expectedRpl = minimum(before.remainingRpl, maximumRpl);

    assert.equal(index, countBefore);
    assert.equal(countAfter, countBefore + 1n);
    assert.equal(after.totalRpl, before.totalRpl);
    assert.equal(after.allottedRpl, before.allottedRpl + expectedRpl);
    assert.equal(after.remainingRpl, before.remainingRpl - expectedRpl);
    assert.equal(after.totalRpl, after.allottedRpl + after.remainingRpl);
    assert.equal(lot.exists, true);
    assert.equal(lot.endBlock, lot.startBlock + duration);
    assert.equal(lot.startPrice, prices.rplPrice * startRatio / ETHER);
    assert.equal(lot.reservePrice, prices.rplPrice * reserveRatio / ETHER);
    assert.equal(lot.totalRpl, expectedRpl);
    assert.equal(lot.currentPrice, lot.startPrice);
    assert.equal(lot.claimedRpl, 0n);
    assert.equal(lot.remainingRpl, lot.totalRpl);
    assert.equal(lot.cleared, false);
    assert.equal(lot.rplRecovered, false);
    return index;
}

export async function placeBidAndAssert(
    protocol: ProtocolView,
    index: bigint,
    options: { caller: string; amount: bigint },
): Promise<void> {
    const callerAddress = await protocol.nodes.address(options.caller);
    const vaultAddress = await protocol.contracts.rocketVault.getAddress();
    const [lotBefore, bidBefore, callerEthBefore, vaultEthBefore, depositPoolEthBefore] = await Promise.all([
        protocol.auctions.lot(index),
        protocol.auctions.bid(index, options.caller),
        ethers.provider.getBalance(callerAddress),
        ethers.provider.getBalance(vaultAddress),
        protocol.contracts.rocketVault.balanceOf("rocketDepositPool"),
    ]);

    const receipt = await protocol.auctions.placeBid(index, options.amount, { caller: options.caller });
    const [lotAfter, bidAfter, callerEthAfter, vaultEthAfter, depositPoolEthAfter, blockPrice] = await Promise.all([
        protocol.auctions.lot(index),
        protocol.auctions.bid(index, options.caller),
        ethers.provider.getBalance(callerAddress),
        ethers.provider.getBalance(vaultAddress),
        protocol.contracts.rocketVault.balanceOf("rocketDepositPool"),
        protocol.auctions.priceAtBlock(index, BigInt(receipt.blockNumber)),
    ]);
    const remainingAtBlockPrice = lotBefore.totalRpl - ETHER * bidBefore.total / blockPrice;
    const maximumBid = remainingAtBlockPrice * blockPrice / ETHER;
    const acceptedBid = minimum(options.amount, maximumBid);
    const expectedClaimedRpl = minimum(
        lotAfter.totalRpl,
        ETHER * bidAfter.total / lotAfter.currentPrice,
    );
    const fee = receipt.gasUsed * receipt.gasPrice;

    assert.equal(bidAfter.total, bidBefore.total + acceptedBid);
    assert.equal(bidAfter.bidder, bidBefore.bidder + acceptedBid);
    assert.equal(bidAfter.priceByTotalBids, ETHER * bidAfter.total / lotAfter.totalRpl);
    assert.equal(lotAfter.claimedRpl, expectedClaimedRpl);
    assert.equal(lotAfter.totalRpl, lotAfter.claimedRpl + lotAfter.remainingRpl);
    assert.equal(callerEthAfter, callerEthBefore - acceptedBid - fee);
    assert.equal(depositPoolEthAfter, depositPoolEthBefore + acceptedBid);
    assert.equal(vaultEthAfter, vaultEthBefore + acceptedBid);
}

export async function claimBidAndAssert(
    protocol: ProtocolView,
    index: bigint,
    options: { caller: string },
): Promise<void> {
    const callerAddress = await protocol.nodes.address(options.caller);
    const token = protocol.contracts.rocketTokenRPL;
    const vault = protocol.contracts.rocketVault;
    const tokenAddress = await token.getAddress();
    const vaultAddress = await vault.getAddress();
    const [balancesBefore, lotBefore, bidBefore, callerRplBefore, vaultRplBefore, auctionRplBefore] = await Promise.all([
        protocol.auctions.balances(),
        protocol.auctions.lot(index),
        protocol.auctions.bid(index, options.caller),
        token.balanceOf(callerAddress),
        token.balanceOf(vaultAddress),
        vault.balanceOfToken("rocketAuctionManager", tokenAddress),
    ]);
    const expectedRpl = minimum(
        balancesBefore.allottedRpl,
        ETHER * bidBefore.bidder / lotBefore.currentPrice,
    );

    await protocol.auctions.claimBid(index, options);
    const [balancesAfter, bidAfter, callerRplAfter, vaultRplAfter, auctionRplAfter] = await Promise.all([
        protocol.auctions.balances(),
        protocol.auctions.bid(index, options.caller),
        token.balanceOf(callerAddress),
        token.balanceOf(vaultAddress),
        vault.balanceOfToken("rocketAuctionManager", tokenAddress),
    ]);

    assert.equal(balancesAfter.allottedRpl, balancesBefore.allottedRpl - expectedRpl);
    assert.equal(balancesAfter.remainingRpl, balancesBefore.remainingRpl);
    assert.equal(bidAfter.bidder, 0n);
    assert.equal(callerRplAfter, callerRplBefore + expectedRpl);
    assert.equal(auctionRplAfter, auctionRplBefore - expectedRpl);
    assert.equal(vaultRplAfter, vaultRplBefore - expectedRpl);
}

export async function recoverUnclaimedRplAndAssert(
    protocol: ProtocolView,
    index: bigint,
    options: { caller: string },
): Promise<void> {
    const [balancesBefore, lotBefore] = await Promise.all([
        protocol.auctions.balances(),
        protocol.auctions.lot(index),
    ]);
    await protocol.auctions.recoverUnclaimedRpl(index, options);
    const [balancesAfter, lotAfter] = await Promise.all([
        protocol.auctions.balances(),
        protocol.auctions.lot(index),
    ]);

    assert.equal(balancesAfter.totalRpl, balancesBefore.totalRpl);
    assert.equal(balancesAfter.allottedRpl, balancesBefore.allottedRpl - lotBefore.remainingRpl);
    assert.equal(balancesAfter.remainingRpl, balancesBefore.remainingRpl + lotBefore.remainingRpl);
    assert.equal(lotAfter.rplRecovered, true);
}
