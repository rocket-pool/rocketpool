import { RocketAuctionManager, RocketDAOProtocolSettingsAuction, RocketVault } from '../_utils/artifacts';


// Place a bid on a lot
export async function placeBid(lotIndex, txOptions) {

    // Load contracts
    const [
        rocketAuctionManager,
        rocketAuctionSettings,
        rocketVault,
    ] = await Promise.all([
        RocketAuctionManager.deployed(),
        RocketDAOProtocolSettingsAuction.deployed(),
        RocketVault.deployed(),
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

    // Get balances
    function getBalances(bidderAddress) {
        return Promise.all([
            web3.eth.getBalance(bidderAddress).then(value => web3.utils.toBN(value)),
            web3.eth.getBalance(rocketVault.address).then(value => web3.utils.toBN(value)),
            rocketVault.balanceOf.call('rocketDepositPool'),
        ]).then(
            ([bidderEth, vaultEth, depositPoolEth]) =>
            ({bidderEth, vaultEth, depositPoolEth})
        );
    }

    // Get lot price at block
    function getLotPriceAtBlock() {
        return web3.eth.getBlock('latest')
            .then(block => rocketAuctionManager.getLotPriceAtBlock.call(lotIndex, block.number));
    }

    // Get initial lot details & balances
    let [lot1, balances1] = await Promise.all([
        getLotDetails(txOptions.from),
        getBalances(txOptions.from),
    ]);

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Place bid
    let txReceipt = await rocketAuctionManager.placeBid(lotIndex, txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated lot details & balances
    let [lot2, balances2] = await Promise.all([
        getLotDetails(txOptions.from),
        getBalances(txOptions.from),
    ]);

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

    // Check balances
    assert(balances2.bidderEth.eq(balances1.bidderEth.sub(bidAmount).sub(txFee)), 'Incorrect updated address ETH balance');
    assert(balances2.depositPoolEth.eq(balances1.depositPoolEth.add(bidAmount)), 'Incorrect updated deposit pool ETH balance');
    assert(balances2.vaultEth.eq(balances1.vaultEth.add(bidAmount)), 'Incorrect updated vault ETH balance');

}

