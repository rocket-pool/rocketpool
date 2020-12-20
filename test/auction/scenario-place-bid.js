import { RocketAuctionManager } from '../_utils/artifacts';


// Place a bid on a lot
export async function placeBid(lotIndex, txOptions) {

    // Load contracts
    const rocketAuctionManager = await RocketAuctionManager.deployed();

    // Place bid
    await rocketAuctionManager.placeBid(lotIndex, txOptions);

}

