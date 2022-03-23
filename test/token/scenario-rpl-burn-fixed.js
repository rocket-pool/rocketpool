import { GoGoTokenGGP } from '../_utils/artifacts';
import { RocketTokenDummyGGP } from '../_utils/artifacts';

// Burn current fixed supply RPL for new RPL
export async function burnFixedRPL(amount, txOptions) {

    // Load contracts
    const gogoTokenGGP = await GoGoTokenGGP.deployed();
    const rocketTokenDummyRPL = await RocketTokenDummyGGP.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketTokenDummyRPL.balanceOf.call(txOptions.from),
            gogoTokenGGP.totalSupply.call(),
            gogoTokenGGP.balanceOf.call(txOptions.from),
            rocketTokenDummyRPL.balanceOf.call(gogoTokenGGP.address),
            gogoTokenGGP.balanceOf.call(gogoTokenGGP.address),
        ]).then(
            ([rplFixedUserBalance, rplTokenSupply, rplUserBalance, rplContractBalanceOfFixedSupply, rplContractBalanceOfSelf]) =>
            ({rplFixedUserBalance, rplTokenSupply, rplUserBalance, rplContractBalanceOfFixedSupply, rplContractBalanceOfSelf})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    //console.log(web3.utils.fromWei(amount));
    //console.log(web3.utils.fromWei(balances1.rplFixedUserBalance), web3.utils.fromWei(balances1.rplContractBalanceOfSelf), web3.utils.fromWei(balances1.rplUserBalance));
 
    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Burn tokens & get tx fee
    let txReceipt = await gogoTokenGGP.swapTokens(amount, txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated balances
    let balances2 = await getBalances();

    //console.log(web3.utils.fromWei(amount));
    //console.log(web3.utils.fromWei(balances2.rplFixedUserBalance), web3.utils.fromWei(balances2.rplContractBalanceOfSelf), web3.utils.fromWei(balances2.rplUserBalance));

    // Calculate values
    let mintAmount = web3.utils.toBN(amount);


    // Check balances
    assert(balances2.rplUserBalance.eq(balances1.rplUserBalance.add(mintAmount)), 'Incorrect updated user token balance');
    assert(balances2.rplContractBalanceOfSelf.eq(balances1.rplContractBalanceOfSelf.sub(mintAmount)), 'RPL contract has not sent the RPL to the user address');

}

