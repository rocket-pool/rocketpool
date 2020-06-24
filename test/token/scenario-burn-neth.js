import { RocketNodeETHToken } from '../_utils/artifacts';


// Burn nETH for ETH
export async function burnNeth(amount, txOptions) {

    // Load contracts
    const rocketNodeETHToken = await RocketNodeETHToken.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketNodeETHToken.totalSupply.call(),
            web3.eth.getBalance(rocketNodeETHToken.address),
            rocketNodeETHToken.balanceOf.call(txOptions.from),
            web3.eth.getBalance(txOptions.from),
        ]).then(
            ([tokenSupply, tokenEthBalance, userTokenBalance, userEthBalance]) =>
            ({tokenSupply, tokenEthBalance: web3.utils.toBN(tokenEthBalance), userTokenBalance, userEthBalance: web3.utils.toBN(userEthBalance)})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Burn tokens
    await rocketNodeETHToken.burn(amount, txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let burnAmount = web3.utils.toBN(amount);

    // Check balances
    assert(balances2.tokenSupply.eq(balances1.tokenSupply.sub(burnAmount)), 'Incorrect updated token supply');
    assert(balances2.tokenEthBalance.eq(balances1.tokenEthBalance.sub(burnAmount)), 'Incorrect updated token ETH balance');
    assert(balances2.userTokenBalance.eq(balances1.userTokenBalance.sub(burnAmount)), 'Incorrect updated user token balance');
    assert(balances2.userEthBalance.gt(balances1.userEthBalance), 'Incorrect updated user ETH balance');

}

