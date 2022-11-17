import { RocketAuctionManager, RocketTokenRPL, RocketVault } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Claim RPL from a lot
export async function claimBid(lotIndex, txOptions) {

    // Load contracts
    const [
        rocketAuctionManager,
        rocketTokenRPL,
        rocketVault,
    ] = await Promise.all([
        RocketAuctionManager.deployed(),
        RocketTokenRPL.deployed(),
        RocketVault.deployed(),
    ]);

    // Get auction contract details
    function getContractDetails() {
        return Promise.all([
            rocketAuctionManager.getAllottedRPLBalance.call(),
            rocketAuctionManager.getRemainingRPLBalance.call(),
        ]).then(
            ([allottedRplBalance, remainingRplBalance]) =>
            ({allottedRplBalance, remainingRplBalance})
        );
    }

    // Get lot details
    function getLotDetails(bidderAddress) {
        return Promise.all([
        	rocketAuctionManager.getLotAddressBidAmount.call(lotIndex, bidderAddress),
            rocketAuctionManager.getLotCurrentPrice.call(lotIndex),
        ]).then(
            ([addressBidAmount, currentPrice]) =>
            ({addressBidAmount, currentPrice})
        );
    }

    // Get balances
    function getBalances(bidderAddress) {
        return Promise.all([
        	rocketTokenRPL.balanceOf.call(bidderAddress),
        	rocketTokenRPL.balanceOf.call(rocketVault.address),
            rocketVault.balanceOfToken.call('rocketAuctionManager', rocketTokenRPL.address),
        ]).then(
            ([bidderRpl, vaultRpl, contractRpl]) =>
            ({bidderRpl, vaultRpl, contractRpl})
        );
    }

    // Get initial details & balances
    let [details1, lot1, balances1] = await Promise.all([
    	getContractDetails(),
        getLotDetails(txOptions.from),
        getBalances(txOptions.from),
    ]);

    // Claim RPL
    await rocketAuctionManager.claimBid(lotIndex, txOptions);

    // Get updated details & balances
    let [details2, lot2, balances2] = await Promise.all([
    	getContractDetails(),
        getLotDetails(txOptions.from),
        getBalances(txOptions.from),
    ]);

    // Get expected values
    const calcBase = '1'.ether;
    const expectedRplAmount = calcBase.mul(lot1.addressBidAmount).div(lot1.currentPrice);

    // Check details
    assertBN.equal(details2.allottedRplBalance, details1.allottedRplBalance.sub(expectedRplAmount), 'Incorrect updated contract allotted RPL balance');
    assertBN.equal(details2.remainingRplBalance, details1.remainingRplBalance, 'Contract remaining RPL balance updated and should not have');
    assertBN.equal(lot2.addressBidAmount, 0, 'Incorrect updated address bid amount');

    // Check balances
    assertBN.equal(balances2.bidderRpl, balances1.bidderRpl.add(expectedRplAmount), 'Incorrect updated address RPL balance');
    assertBN.equal(balances2.contractRpl, balances1.contractRpl.sub(expectedRplAmount), 'Incorrect updated auction contract RPL balance');
    assertBN.equal(balances2.vaultRpl, balances1.vaultRpl.sub(expectedRplAmount), 'Incorrect updated vault RPL balance');
}

