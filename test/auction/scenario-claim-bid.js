import { RocketAuctionManager, RocketTokenRPL, RocketVault } from '../_utils/artifacts';


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

    // Get initial lot details & balances
    let [lot1, balances1] = await Promise.all([
        getLotDetails(txOptions.from),
        getBalances(txOptions.from),
    ]);

    // Claim RPL
    await rocketAuctionManager.claimBid(lotIndex, txOptions);

    // Get updated lot details & balances
    let [lot2, balances2] = await Promise.all([
        getLotDetails(txOptions.from),
        getBalances(txOptions.from),
    ]);

    // Get expected values
    const calcBase = web3.utils.toBN(web3.utils.toWei('1', 'ether'));
    const expectedRplAmount = calcBase.mul(lot1.addressBidAmount).div(lot1.currentPrice);

    // Check balances
    assert(balances2.bidderRpl.eq(balances1.bidderRpl.add(expectedRplAmount)), 'Incorrect updated address RPL balance');
    assert(balances2.contractRpl.eq(balances1.contractRpl.sub(expectedRplAmount)), 'Incorrect updated auction contract RPL balance');
    assert(balances2.vaultRpl.eq(balances1.vaultRpl.sub(expectedRplAmount)), 'Incorrect updated vault RPL balance');

}

