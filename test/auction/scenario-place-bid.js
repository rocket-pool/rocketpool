import { RocketAuctionManager, RocketVault } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

// Place a bid on a lot
export async function placeBid(lotIndex, txOptions) {

    // Load contracts
    const [
        rocketAuctionManager,
        rocketVault,
    ] = await Promise.all([
        RocketAuctionManager.deployed(),
        RocketVault.deployed(),
    ]);

    // Calculation base value
    const calcBase = '1'.ether;

    // Get lot details
    function getLotDetails(bidderAddress) {
        return Promise.all([
            rocketAuctionManager.getLotTotalRPLAmount(lotIndex),
            rocketAuctionManager.getLotTotalBidAmount(lotIndex),
            rocketAuctionManager.getLotAddressBidAmount(lotIndex, bidderAddress),
            rocketAuctionManager.getLotPriceByTotalBids(lotIndex),
            rocketAuctionManager.getLotCurrentPrice(lotIndex),
            rocketAuctionManager.getLotClaimedRPLAmount(lotIndex),
            rocketAuctionManager.getLotRemainingRPLAmount(lotIndex),
        ]).then(
            ([totalRplAmount, totalBidAmount, addressBidAmount, priceByTotalBids, currentPrice, claimedRplAmount, remainingRplAmount]) =>
                ({
                    totalRplAmount,
                    totalBidAmount,
                    addressBidAmount,
                    priceByTotalBids,
                    currentPrice,
                    claimedRplAmount,
                    remainingRplAmount,
                }),
        );
    }

    // Get balances
    function getBalances(bidderAddress) {
        return Promise.all([
            ethers.provider.getBalance(bidderAddress),
            ethers.provider.getBalance(rocketVault.target),
            rocketVault.balanceOf('rocketDepositPool'),
        ]).then(
            ([bidderEth, vaultEth, depositPoolEth]) =>
                ({ bidderEth, vaultEth, depositPoolEth }),
        );
    }

    // Get lot price at block
    function getLotPriceAtBlock() {
        return ethers.provider.getBlock('latest')
            .then(block => rocketAuctionManager.getLotPriceAtBlock(lotIndex, block.number));
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
    let tx = await rocketAuctionManager.connect(txOptions.from).placeBid(lotIndex, txOptions);
    let txReceipt = await tx.wait();
    let txFee = gasPrice * txReceipt.gasUsed;

    // Get updated lot details & balances
    let [lot2, balances2] = await Promise.all([
        getLotDetails(txOptions.from),
        getBalances(txOptions.from),
    ]);

    // Get parameters
    const lotBlockPrice = await getLotPriceAtBlock();
    const lotRemainingRplAmount = lot1.totalRplAmount - (calcBase * lot1.totalBidAmount / lotBlockPrice);

    // Get expected values
    const maxBidAmount = lotRemainingRplAmount * lotBlockPrice / calcBase;
    const txValue = txOptions.value;
    const bidAmount = (txValue > maxBidAmount) ? maxBidAmount : txValue;

    // Check lot details
    assertBN.equal(lot2.totalBidAmount, lot1.totalBidAmount + bidAmount, 'Incorrect updated total bid amount');
    assertBN.equal(lot2.addressBidAmount, lot1.addressBidAmount + bidAmount, 'Incorrect updated address bid amount');
    assertBN.equal(lot2.priceByTotalBids, calcBase * lot2.totalBidAmount / lot2.totalRplAmount, 'Incorrect updated price by total bids');
    assertBN.equal(lot2.claimedRplAmount, calcBase * lot2.totalBidAmount / lot2.currentPrice, 'Incorrect updated claimed RPL amount');
    assertBN.equal(lot2.totalRplAmount, lot2.claimedRplAmount + lot2.remainingRplAmount, 'Incorrect updated RPL amounts');

    // Check balances
    assertBN.equal(balances2.bidderEth, balances1.bidderEth - bidAmount - txFee, 'Incorrect updated address ETH balance');
    assertBN.equal(balances2.depositPoolEth, balances1.depositPoolEth + bidAmount, 'Incorrect updated deposit pool ETH balance');
    assertBN.equal(balances2.vaultEth, balances1.vaultEth + bidAmount, 'Incorrect updated vault ETH balance');
}
