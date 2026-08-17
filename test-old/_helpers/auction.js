import { RocketAuctionManager } from '../_utils/artifacts';

// Get lot start/end blocks
export async function getLotStartBlock(lotIndex) {
    const rocketAuctionManager = await RocketAuctionManager.deployed();
    return rocketAuctionManager.getLotStartBlock(lotIndex);
}

export async function getLotEndBlock(lotIndex) {
    const rocketAuctionManager = await RocketAuctionManager.deployed();
    return rocketAuctionManager.getLotEndBlock(lotIndex);
}

// Get lot price at a block
export async function getLotPriceAtBlock(lotIndex, block) {
    const rocketAuctionManager = await RocketAuctionManager.deployed();
    return rocketAuctionManager.getLotPriceAtBlock(lotIndex, block);
}

// Create a new lot for auction
export async function auctionCreateLot(txOptions) {
    const rocketAuctionManager = await RocketAuctionManager.deployed();
    await rocketAuctionManager.connect(txOptions.from).createLot(txOptions);
}

// Place a bid on a lot
export async function auctionPlaceBid(lotIndex, txOptions) {
    const rocketAuctionManager = await RocketAuctionManager.deployed();
    await rocketAuctionManager.connect(txOptions.from).placeBid(lotIndex, txOptions);
}

