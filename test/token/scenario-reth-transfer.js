import { RocketTokenRETH } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

// Transfer rETH between accounts
export async function transferReth(to, amount, txOptions) {
    // Load contracts
    const rocketTokenRETH = await RocketTokenRETH.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketTokenRETH.balanceOf(txOptions.from),
            rocketTokenRETH.balanceOf(to),
        ]).then(
            ([userFromTokenBalance, userToTokenBalance]) =>
                ({ userFromTokenBalance, userToTokenBalance }),
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Transfer tokens
    await rocketTokenRETH.connect(txOptions.from).transfer(to, amount, txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Check balances
    assertBN.equal(balances2.userFromTokenBalance, balances1.userFromTokenBalance - amount, 'Incorrect updated user token balance');
    assertBN.equal(balances2.userToTokenBalance, balances1.userToTokenBalance + amount, 'Incorrect updated user token balance');
}
