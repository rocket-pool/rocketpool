import { RocketAuctionManager, RocketAuctionSettings, RocketNetworkPrices } from '../_utils/artifacts';


// Create a new lot for auction
export async function createLot(txOptions) {

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
    const [lotMaxEthValue, rplPrice] = await Promise.all([
        rocketAuctionSettings.getLotMaximumEthValue.call(),
        rocketNetworkPrices.getRPLPrice.call(),
    ]);

    // Get auction contract details
    function getContractDetails() {
        return Promise.all([
            rocketAuctionManager.getTotalRPLBalance.call(),
            rocketAuctionManager.getAllottedRPLBalance.call(),
            rocketAuctionManager.getRemainingRPLBalance.call(),
            rocketAuctionManager.getLotCount.call(),
        ]).then(
            ([totalRplBalance, allottedRplBalance, remainingRplBalance, lotCount]) =>
            ({totalRplBalance, allottedRplBalance, remainingRplBalance, lotCount})
        );
    }

    // Get initial contract details
    let [details1] = await Promise.all([
        getContractDetails(),
    ]);

    // Create lot
    await rocketAuctionManager.createLot(txOptions);

    // Get updated contract details
    let [details2] = await Promise.all([
        getContractDetails(),
    ]);

    // Get expected values
    const calcBase = web3.utils.toBN(web3.utils.toWei('1', 'ether'));
    const lotMaxRplAmount = calcBase.mul(lotMaxEthValue).div(rplPrice);
    const expectedRemainingRplBalance = (details1.remainingRplBalance.gt(lotMaxRplAmount) ? details1.remainingRplBalance.sub(lotMaxRplAmount) : web3.utils.toBN(0));

    // Check contract details
    assert(details2.totalRplBalance.eq(details1.totalRplBalance), 'Total RPL balance updated and should not have');
    assert(details2.remainingRplBalance.eq(expectedRemainingRplBalance), 'Incorrect updated remaining RPL balance');
    assert(details2.totalRplBalance.eq(details2.allottedRplBalance.add(details2.remainingRplBalance)), 'Incorrect updated RPL balances');
    assert(details2.lotCount.eq(details1.lotCount.add(web3.utils.toBN(1))), 'Incorrect updated lot count');

}

