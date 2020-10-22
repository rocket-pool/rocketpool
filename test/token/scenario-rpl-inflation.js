import { RocketTokenRPL } from '../_utils/artifacts';

// Burn current fixed supply RPL for new RPL
export async function rplCalcInflation(txOptions) {

    // Load contracts
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Get data about the inflation
    function getInflationData() {
        return Promise.all([
            rocketTokenRPL.getInflationIntervalRate.call(),
        ]).then(
            ([itervalsPassed]) =>
            ({itervalsPassed})
        );
    }

    // Get initial data
    let inflationData1 = await getInflationData();

    //console.log(web3.utils.fromWei(amount), web3.utils.fromWei(balances1.rplFixedUserBalance), web3.utils.fromWei(balances1.rplTokenSupply), web3.utils.fromWei(balances1.rplUserBalance));
 
    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Burn tokens & get tx fee
    //let txReceipt = await rocketTokenRPL.swapTokens(amount, txOptions);
    //let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated data
    let inflationData2 = await getInflationData();

    console.log(inflationData1.itervalsPassed.toString(), inflationData2.itervalsPassed.toString());

    // Check balances
    //assert(balances2.rplTokenSupply.eq(balances1.rplTokenSupply.add(mintAmount)), 'Incorrect updated token supply');
    //assert(balances2.rplUserBalance.eq(balances1.rplUserBalance.add(mintAmount)), 'Incorrect updated user token balance');
    //assert(balances2.rplContractBalanceOfFixedSupply.eq(balances1.rplContractBalanceOfFixedSupply.add(mintAmount)), 'RPL contract does not contain sent fixed RPL amount');

}

