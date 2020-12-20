import { RocketAuctionManager } from '../_utils/artifacts';


// Claim RPL from a lot
export async function claimBid(lotIndex, txOptions) {

    // Load contracts
    const rocketAuctionManager = await RocketAuctionManager.deployed();

    // Claim RPL
    await rocketAuctionManager.claimBid(lotIndex, txOptions);

}

