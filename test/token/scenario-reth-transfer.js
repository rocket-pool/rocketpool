import { GoGoTokenGGPAVAX } from '../_utils/artifacts';


// Transfer rETH between accounts
export async function transferReth(to, amount, txOptions) {

    // Load contracts
    const gogoTokenGGPAVAX = await GoGoTokenGGPAVAX.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            gogoTokenGGPAVAX.balanceOf.call(txOptions.from),
            gogoTokenGGPAVAX.balanceOf.call(to)
        ]).then(
            ([userFromTokenBalance, userToTokenBalance]) =>
            ({userFromTokenBalance, userToTokenBalance})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Transfer tokens
    await gogoTokenGGPAVAX.transfer(to, amount, txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Check balances
    assert(balances2.userFromTokenBalance.eq(balances1.userFromTokenBalance.sub(amount)), 'Incorrect updated user token balance');
    assert(balances2.userToTokenBalance.eq(balances1.userToTokenBalance.add(amount)), 'Incorrect updated user token balance');

}

