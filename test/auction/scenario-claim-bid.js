import { RocketAuctionManager, GoGoTokenGGP, RocketVault } from '../_utils/artifacts';


// Claim RPL from a lot
export async function claimBid(lotIndex, txOptions) {

    // Load contracts
    const [
        rocketAuctionManager,
        gogoTokenGGP,
        rocketVault,
    ] = await Promise.all([
        RocketAuctionManager.deployed(),
        GoGoTokenGGP.deployed(),
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
        	gogoTokenGGP.balanceOf.call(bidderAddress),
        	gogoTokenGGP.balanceOf.call(rocketVault.address),
            rocketVault.balanceOfToken.call('rocketAuctionManager', gogoTokenGGP.address),
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
    const calcBase = web3.utils.toBN(web3.utils.toWei('1', 'ether'));
    const expectedRplAmount = calcBase.mul(lot1.addressBidAmount).div(lot1.currentPrice);

    // Check details
    assert(details2.allottedRplBalance.eq(details1.allottedRplBalance.sub(expectedRplAmount)), 'Incorrect updated contract allotted RPL balance');
    assert(details2.remainingRplBalance.eq(details1.remainingRplBalance), 'Contract remaining RPL balance updated and should not have');
    assert(lot2.addressBidAmount.eq(web3.utils.toBN(0)), 'Incorrect updated address bid amount');

    // Check balances
    assert(balances2.bidderRpl.eq(balances1.bidderRpl.add(expectedRplAmount)), 'Incorrect updated address RPL balance');
    assert(balances2.contractRpl.eq(balances1.contractRpl.sub(expectedRplAmount)), 'Incorrect updated auction contract RPL balance');
    assert(balances2.vaultRpl.eq(balances1.vaultRpl.sub(expectedRplAmount)), 'Incorrect updated vault RPL balance');

}

