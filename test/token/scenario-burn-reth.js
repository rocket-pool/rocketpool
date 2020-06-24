import { RocketETHToken, RocketNetworkBalances } from '../_utils/artifacts';


// Burn rETH for ETH
export async function burnReth(amount, txOptions) {

    // Load contracts
    const [
        rocketETHToken,
        rocketNetworkBalances,
    ] = await Promise.all([
        RocketETHToken.deployed(),
        RocketNetworkBalances.deployed(),
    ]);

    // Get parameters
    let rethExchangeRate = await rocketETHToken.getExchangeRate.call();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketETHToken.totalSupply.call(),
            web3.eth.getBalance(rocketETHToken.address),
            rocketNetworkBalances.getTotalETHBalance.call(),
            rocketETHToken.balanceOf.call(txOptions.from),
            web3.eth.getBalance(txOptions.from),
        ]).then(
            ([tokenSupply, tokenEthBalance, networkEthBalance, userTokenBalance, userEthBalance]) =>
            ({tokenSupply, tokenEthBalance: web3.utils.toBN(tokenEthBalance), networkEthBalance, userTokenBalance, userEthBalance: web3.utils.toBN(userEthBalance)})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Burn tokens & get tx fee
    let txReceipt = await rocketETHToken.burn(amount, txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let burnAmount = web3.utils.toBN(amount);
    let calcBase = web3.utils.toBN(web3.utils.toWei('1', 'ether'));
    let expectedEthTransferred = burnAmount.mul(rethExchangeRate).div(calcBase);

    // Check balances
    assert(balances2.tokenSupply.eq(balances1.tokenSupply.sub(burnAmount)), 'Incorrect updated token supply');
    assert(balances2.tokenEthBalance.eq(balances1.tokenEthBalance.sub(expectedEthTransferred)), 'Incorrect updated token ETH balance');
    assert(balances2.networkEthBalance.eq(balances1.networkEthBalance.sub(expectedEthTransferred)), 'Incorrect updated token ETH balance');
    assert(balances2.userTokenBalance.eq(balances1.userTokenBalance.sub(burnAmount)), 'Incorrect updated user token balance');
    assert(balances2.userEthBalance.eq(balances1.userEthBalance.add(expectedEthTransferred).sub(txFee)), 'Incorrect updated user ETH balance');

}

