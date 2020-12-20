import { RocketAuctionManager } from '../_utils/artifacts';


// Recover unclaimed RPL from a lot
export async function recoverUnclaimedRPL(lotIndex, txOptions) {

    // Load contracts
    const rocketAuctionManager = await RocketAuctionManager.deployed();

    // Recover RPL
    await rocketAuctionManager.recoverUnclaimedRPL(lotIndex, txOptions);

}

