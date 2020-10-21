import { RocketTokenRPL } from '../_utils/artifacts';
import { RocketTokenDummyRPL } from '../_utils/artifacts';

// Burn current fixed supply RPL for new RPL
export async function burnFixedRPL(amount, txOptions) {

    // Load contracts
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    const rocketTokenDummyRPL = await RocketTokenDummyRPL.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketTokenDummyRPL.balanceOf.call(txOptions.from),
            rocketTokenRPL.totalSupply.call(),
            rocketTokenRPL.balanceOf.call(txOptions.from),
            rocketTokenDummyRPL.balanceOf.call(rocketTokenRPL.address),
        ]).then(
            ([rplFixedUserBalance, rplTokenSupply, rplUserBalance, rplContractBalanceOfFixedSupply]) =>
            ({rplFixedUserBalance, rplTokenSupply, rplUserBalance, rplContractBalanceOfFixedSupply})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    //console.log(web3.utils.fromWei(amount), web3.utils.fromWei(balances1.rplFixedUserBalance), web3.utils.fromWei(balances1.rplTokenSupply), web3.utils.fromWei(balances1.rplUserBalance));
 
    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Burn tokens & get tx fee
    let txReceipt = await rocketTokenRPL.swapTokens(amount, txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let mintAmount = web3.utils.toBN(amount);



    // Check balances
    assert(balances2.rplTokenSupply.eq(balances1.rplTokenSupply.add(mintAmount)), 'Incorrect updated token supply');
    assert(balances2.rplUserBalance.eq(balances1.rplUserBalance.add(mintAmount)), 'Incorrect updated user token balance');
    assert(balances2.rplContractBalanceOfFixedSupply.eq(balances1.rplContractBalanceOfFixedSupply.add(mintAmount)), 'RPL contract does not contain sent fixed RPL amount');

}

