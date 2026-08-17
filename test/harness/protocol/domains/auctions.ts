import type { ContractTransactionReceipt } from "ethers";

import type { ProtocolContracts } from "../contracts";
import { GuardedFacade } from "../view";

export interface AuctionBalances {
    totalRpl: bigint;
    allottedRpl: bigint;
    remainingRpl: bigint;
}

export interface AuctionLotDetails {
    exists: boolean;
    startBlock: bigint;
    endBlock: bigint;
    startPrice: bigint;
    reservePrice: bigint;
    totalRpl: bigint;
    currentPrice: bigint;
    claimedRpl: bigint;
    remainingRpl: bigint;
    cleared: boolean;
    rplRecovered: boolean;
}

export interface AuctionBidDetails {
    total: bigint;
    bidder: bigint;
    priceByTotalBids: bigint;
}

export class AuctionActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async fundRpl(from: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(from);
        const tokenAddress = await this.contracts.rocketTokenRPL.getAddress();
        await (await this.contracts.rocketTokenRPL.connect(signer).approve(
            await this.contracts.rocketVault.getAddress(),
            amount,
        )).wait();
        await (await this.contracts.rocketVault.connect(signer).depositToken(
            "rocketAuctionManager",
            tokenAddress,
            amount,
        )).wait();
        this.view.context.trace(`funded auctions with ${amount} RPL from ${from}`);
    }

    async balances(): Promise<AuctionBalances> {
        this.active();
        const [totalRpl, allottedRpl, remainingRpl] = await Promise.all([
            this.contracts.rocketAuctionManager.getTotalRPLBalance(),
            this.contracts.rocketAuctionManager.getAllottedRPLBalance(),
            this.contracts.rocketAuctionManager.getRemainingRPLBalance(),
        ]);
        return { totalRpl, allottedRpl, remainingRpl };
    }

    async lotCount(): Promise<bigint> {
        this.active();
        return this.contracts.rocketAuctionManager.getLotCount();
    }

    async lot(index: bigint): Promise<AuctionLotDetails> {
        this.active();
        const auction = this.contracts.rocketAuctionManager;
        const [
            exists,
            startBlock,
            endBlock,
            startPrice,
            reservePrice,
            totalRpl,
            currentPrice,
            claimedRpl,
            remainingRpl,
            cleared,
            rplRecovered,
        ] = await Promise.all([
            auction.getLotExists(index),
            auction.getLotStartBlock(index),
            auction.getLotEndBlock(index),
            auction.getLotStartPrice(index),
            auction.getLotReservePrice(index),
            auction.getLotTotalRPLAmount(index),
            auction.getLotCurrentPrice(index),
            auction.getLotClaimedRPLAmount(index),
            auction.getLotRemainingRPLAmount(index),
            auction.getLotIsCleared(index),
            auction.getLotRPLRecovered(index),
        ]);
        return {
            exists,
            startBlock,
            endBlock,
            startPrice,
            reservePrice,
            totalRpl,
            currentPrice,
            claimedRpl,
            remainingRpl,
            cleared,
            rplRecovered,
        };
    }

    async bid(index: bigint, bidder: string): Promise<AuctionBidDetails> {
        this.active();
        const address = await this.view.context.actorAddress(bidder);
        const [total, bidderAmount, priceByTotalBids] = await Promise.all([
            this.contracts.rocketAuctionManager.getLotTotalBidAmount(index),
            this.contracts.rocketAuctionManager.getLotAddressBidAmount(index, address),
            this.contracts.rocketAuctionManager.getLotPriceByTotalBids(index),
        ]);
        return { total, bidder: bidderAmount, priceByTotalBids };
    }

    async priceAtBlock(index: bigint, block: bigint): Promise<bigint> {
        this.active();
        return this.contracts.rocketAuctionManager.getLotPriceAtBlock(index, block);
    }

    async createLot(options: { caller: string }): Promise<bigint> {
        this.active();
        const index = await this.lotCount();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketAuctionManager.connect(signer).createLot()).wait();
        this.view.context.trace(`created auction lot ${index} as ${options.caller}`);
        return index;
    }

    async placeBid(
        index: bigint,
        amount: bigint,
        options: { caller: string },
    ): Promise<ContractTransactionReceipt> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        const receipt = await (await this.contracts.rocketAuctionManager.connect(signer).placeBid(
            index,
            { value: amount },
        )).wait();
        if (!receipt) throw new Error(`Auction bid for lot ${index} was not mined`);
        this.view.context.trace(`bid ${amount} wei on auction lot ${index} as ${options.caller}`);
        return receipt;
    }

    async claimBid(index: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketAuctionManager.connect(signer).claimBid(index)).wait();
        this.view.context.trace(`claimed auction lot ${index} bid as ${options.caller}`);
    }

    async recoverUnclaimedRpl(index: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketAuctionManager.connect(signer).recoverUnclaimedRPL(index)).wait();
        this.view.context.trace(`recovered unclaimed RPL from auction lot ${index} as ${options.caller}`);
    }
}
