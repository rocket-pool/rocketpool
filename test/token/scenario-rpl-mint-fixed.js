import { RocketTokenDummyRPL } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Mint RPL from the dummy RPL contract to simulate a user having existing fixed supply RPL
export async function mintDummyRPL(to, amount, txOptions) {
    // Load contracts
    const rocketTokenDummyRPL = await RocketTokenDummyRPL.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketTokenDummyRPL.totalSupply.call(),
            rocketTokenDummyRPL.balanceOf.call(to),
        ]).then(
            ([tokenSupply, userTokenBalance]) =>
            ({tokenSupply, userTokenBalance})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Mint tokens
    await rocketTokenDummyRPL.mint(to, amount, txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let mintAmount = web3.utils.toBN(amount);

    // Check balances
    assertBN.equal(balances2.tokenSupply, balances1.tokenSupply.add(mintAmount), 'Incorrect updated token supply');
    assertBN.equal(balances2.userTokenBalance, balances1.userTokenBalance.add(mintAmount), 'Incorrect updated user token balance');
}
