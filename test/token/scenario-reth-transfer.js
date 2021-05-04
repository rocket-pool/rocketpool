import { RocketTokenRETH } from '../_utils/artifacts';


// Burn rETH for ETH
export async function transferReth(to, amount, txOptions) {

    // Load contracts
    const rocketTokenRETH = await RocketTokenRETH.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketTokenRETH.balanceOf.call(txOptions.from),
            rocketTokenRETH.balanceOf.call(to)
        ]).then(
            ([userFromTokenBalance, userToTokenBalance]) =>
            ({userFromTokenBalance, userToTokenBalance})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Transfer tokens
    await rocketTokenRETH.transfer(to, amount, txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Check balances
    assert(balances2.userFromTokenBalance.eq(balances1.userFromTokenBalance.sub(amount)), 'Incorrect updated user token balance');
    assert(balances2.userToTokenBalance.eq(balances1.userToTokenBalance.add(amount)), 'Incorrect updated user token balance');

}

