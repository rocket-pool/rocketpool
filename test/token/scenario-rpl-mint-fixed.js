import { RocketTokenDummyRPL } from '../_utils/artifacts';


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

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Mint tokens
    let txReceipt = await rocketTokenDummyRPL.mint(to, amount, txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let mintAmount = web3.utils.toBN(amount);

    //console.log(web3.utils.fromWei(balances1.userTokenBalance));
    //console.log(web3.utils.fromWei(balances2.userTokenBalance));

    // Check balances
    assert(balances2.tokenSupply.eq(balances1.tokenSupply.add(mintAmount)), 'Incorrect updated token supply');
    assert(balances2.userTokenBalance.eq(balances1.userTokenBalance.add(mintAmount)), 'Incorrect updated user token balance');

}

