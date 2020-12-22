import { RocketAuctionManager, RocketAuctionSettings, RocketNetworkPrices } from '../_utils/artifacts';


// Place a bid on a lot
export async function placeBid(lotIndex, txOptions) {

    // Load contracts
    const [
        rocketAuctionManager,
        rocketAuctionSettings,
        rocketNetworkPrices,
    ] = await Promise.all([
        RocketAuctionManager.deployed(),
        RocketAuctionSettings.deployed(),
        RocketNetworkPrices.deployed(),
    ]);

    // Get parameters
    const [
        rplPrice,
    ] = await Promise.all([
        rocketNetworkPrices.getRPLPrice.call(),
    ]);

    // Calculation base value
    const calcBase = web3.utils.toBN(web3.utils.toWei('1', 'ether'));

    // Get lot details
    function getLotDetails(bidderAddress) {
        return Promise.all([
            rocketAuctionManager.getLotTotalRPLAmount.call(lotIndex),
            rocketAuctionManager.getLotTotalBidAmount.call(lotIndex),
            rocketAuctionManager.getLotAddressBidAmount.call(lotIndex, bidderAddress),
            rocketAuctionManager.getLotPriceByTotalBids.call(lotIndex),
            rocketAuctionManager.getLotCurrentPrice.call(lotIndex),
            rocketAuctionManager.getLotClaimedRPLAmount.call(lotIndex),
            rocketAuctionManager.getLotRemainingRPLAmount.call(lotIndex),
        ]).then(
            ([totalRplAmount, totalBidAmount, addressBidAmount, priceByTotalBids, currentPrice, claimedRplAmount, remainingRplAmount]) =>
            ({totalRplAmount, totalBidAmount, addressBidAmount, priceByTotalBids, currentPrice, claimedRplAmount, remainingRplAmount})
        );
    }

    // Get lot price at block
    function getLotPriceAtBlock() {
        return web3.eth.getBlock('latest')
            .then(block => rocketAuctionManager.getLotPriceAtBlock.call(lotIndex, block.number));
    }

    // Get initial lot details
    let lot1 = await getLotDetails(txOptions.from);

    // Place bid
    await rocketAuctionManager.placeBid(lotIndex, txOptions);

    // Get updated lot details
    let lot2 = await getLotDetails(txOptions.from);

    // Get parameters
    const lotBlockPrice = await getLotPriceAtBlock();
    const lotRemainingRplAmount = lot1.totalRplAmount.sub(calcBase.mul(lot1.totalBidAmount).div(lotBlockPrice));

    // Get expected values
    const maxBidAmount = lotRemainingRplAmount.mul(lotBlockPrice).div(calcBase);
    const txValue = web3.utils.toBN(txOptions.value);
    const bidAmount = (txValue.gt(maxBidAmount) ? maxBidAmount : txValue);

    // Check lot details
    assert(lot2.totalBidAmount.eq(lot1.totalBidAmount.add(bidAmount)), 'Incorrect updated total bid amount');
    assert(lot2.addressBidAmount.eq(lot1.addressBidAmount.add(bidAmount)), 'Incorrect updated address bid amount');
    assert(lot2.priceByTotalBids.eq(calcBase.mul(lot2.totalBidAmount).div(lot2.totalRplAmount)), 'Incorrect updated price by total bids');
    assert(lot2.claimedRplAmount.eq(calcBase.mul(lot2.totalBidAmount).div(lot2.currentPrice)), 'Incorrect updated claimed RPL amount');
    assert(lot2.totalRplAmount.eq(lot2.claimedRplAmount.add(lot2.remainingRplAmount)), 'Incorrect updated RPL amounts');

}

