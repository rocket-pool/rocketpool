import { RocketTokenDummyRPL } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Allow RPL from the fixed contract to be spent
export async function allowDummyRPL(to, amount, txOptions) {
    // Load contracts
    const rocketTokenDummyRPL = await RocketTokenDummyRPL.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketTokenDummyRPL.allowance.call(txOptions.from, to),
        ]).then(
            ([tokenAllowance]) =>
            ({tokenAllowance})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Mint tokens
    await rocketTokenDummyRPL.approve(to, amount, txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let allowanceAmount = web3.utils.toBN(amount);

    // Check balances
    assertBN.equal(balances2.tokenAllowance, balances1.tokenAllowance.add(allowanceAmount), 'Incorrect allowance for token');
}
