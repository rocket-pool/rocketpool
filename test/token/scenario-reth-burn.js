import { RocketTokenRETH } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Burn rETH for ETH
export async function burnReth(amount, txOptions) {
    // Load contracts
    const rocketTokenRETH = await RocketTokenRETH.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketTokenRETH.totalSupply.call(),
            rocketTokenRETH.balanceOf.call(txOptions.from),
            web3.eth.getBalance(txOptions.from).then(value => web3.utils.toBN(value)),
        ]).then(
            ([tokenSupply, userTokenBalance, userEthBalance]) =>
            ({tokenSupply, userTokenBalance, userEthBalance})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Set gas price
    let gasPrice = '20'.gwei;
    txOptions.gasPrice = gasPrice;

    // Burn tokens & get tx fee
    let txReceipt = await rocketTokenRETH.burn(amount, txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let burnAmount = web3.utils.toBN(amount);
    let expectedEthTransferred = await rocketTokenRETH.getEthValue(burnAmount);

    // Check balances
    assertBN.equal(balances2.tokenSupply, balances1.tokenSupply.sub(burnAmount), 'Incorrect updated token supply');
    assertBN.equal(balances2.userTokenBalance, balances1.userTokenBalance.sub(burnAmount), 'Incorrect updated user token balance');
    assertBN.equal(balances2.userEthBalance, balances1.userEthBalance.add(expectedEthTransferred).sub(txFee), 'Incorrect updated user ETH balance');
}
