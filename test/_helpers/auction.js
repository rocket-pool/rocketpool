import { RocketAuctionManager } from '../_utils/artifacts';


// Create a new lot for auction
export async function auctionCreateLot(txOptions) {
    const rocketAuctionManager = await RocketAuctionManager.deployed();
    await rocketAuctionManager.createLot(txOptions);
}

