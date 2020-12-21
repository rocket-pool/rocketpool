import { RocketAuctionManager } from '../_utils/artifacts';


// Get the remaining amount of RPL for sale in a lot
export async function getLotRemainingRPLAmount(lotIndex) {
	const rocketAuctionManager = await RocketAuctionManager.deployed();
	let remainingRplAmount = await rocketAuctionManager.getLotRemainingRPLAmount.call(lotIndex);
	return remainingRplAmount;
}


// Create a new lot for auction
export async function auctionCreateLot(txOptions) {
    const rocketAuctionManager = await RocketAuctionManager.deployed();
    await rocketAuctionManager.createLot(txOptions);
}

