import { RocketAuctionManager, RocketDAOProtocolSettingsAuction, RocketVault } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


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
    const calcBase = '1'.ether;

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
            web3.eth.getBalance(bidderAddress).then(value => value.BN),
            web3.eth.getBalance(rocketVault.address).then(value => value.BN),
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
    let gasPrice = '20'.gwei;
    txOptions.gasPrice = gasPrice;

    // Place bid
    let txReceipt = await rocketAuctionManager.placeBid(lotIndex, txOptions);
    let txFee = gasPrice.mul(txReceipt.receipt.gasUsed.BN);

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
    const txValue = txOptions.value;
    const bidAmount = (txValue.gt(maxBidAmount) ? maxBidAmount : txValue);

    // Check lot details
    assertBN.equal(lot2.totalBidAmount, lot1.totalBidAmount.add(bidAmount), 'Incorrect updated total bid amount');
    assertBN.equal(lot2.addressBidAmount, lot1.addressBidAmount.add(bidAmount), 'Incorrect updated address bid amount');
    assertBN.equal(lot2.priceByTotalBids, calcBase.mul(lot2.totalBidAmount).div(lot2.totalRplAmount), 'Incorrect updated price by total bids');
    assertBN.equal(lot2.claimedRplAmount, calcBase.mul(lot2.totalBidAmount).div(lot2.currentPrice), 'Incorrect updated claimed RPL amount');
    assertBN.equal(lot2.totalRplAmount, lot2.claimedRplAmount.add(lot2.remainingRplAmount), 'Incorrect updated RPL amounts');

    // Check balances
    assertBN.equal(balances2.bidderEth, balances1.bidderEth.sub(bidAmount).sub(txFee), 'Incorrect updated address ETH balance');
    assertBN.equal(balances2.depositPoolEth, balances1.depositPoolEth.add(bidAmount), 'Incorrect updated deposit pool ETH balance');
    assertBN.equal(balances2.vaultEth, balances1.vaultEth.add(bidAmount), 'Incorrect updated vault ETH balance');
}
