import { RocketTokenDummyGGP } from '../_utils/artifacts';


// Allow RPL from the fixed contract to be spent
export async function allowDummyRPL(to, amount, txOptions) {

    // Load contracts
    const rocketTokenDummyRPL = await RocketTokenDummyGGP.deployed();

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

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Mint tokens
    let txReceipt = await rocketTokenDummyRPL.approve(to, amount, txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let allowanceAmount = web3.utils.toBN(amount);

    // Check balances
    assert(balances2.tokenAllowance.eq(balances1.tokenAllowance.add(allowanceAmount)), 'Incorrect allowance for token');

}

