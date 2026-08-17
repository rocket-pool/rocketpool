import { RocketTokenDummyRPL } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

// Allow RPL from the fixed contract to be spent
export async function allowDummyRPL(to, amount, txOptions) {
    // Load contracts
    const rocketTokenDummyRPL = await RocketTokenDummyRPL.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketTokenDummyRPL.allowance(txOptions.from.address, to),
        ]).then(
            ([tokenAllowance]) =>
                ({ tokenAllowance }),
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Mint tokens
    await rocketTokenDummyRPL.connect(txOptions.from).approve(to, amount, txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let allowanceAmount = BigInt(amount);

    // Check balances
    assertBN.equal(balances2.tokenAllowance, balances1.tokenAllowance + allowanceAmount, 'Incorrect allowance for token');
}
