import { RocketAuctionManager } from '../_utils/artifacts';


// Create a new lot for auction
export async function createLot(txOptions) {

    // Load contracts
    const rocketAuctionManager = await RocketAuctionManager.deployed();

    // Create lot
    await rocketAuctionManager.createLot(txOptions);

}

