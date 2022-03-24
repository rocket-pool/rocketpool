import { RocketDepositPool, GoGoTokenGGPAVAX, RocketVault } from '../_utils/artifacts';


// Make a deposit into the deposit pool
export async function deposit(txOptions) {

    // Load contracts
    const [
        rocketDepositPool,
        gogoTokenGGPAVAX,
        rocketVault,
    ] = await Promise.all([
        RocketDepositPool.deployed(),
        GoGoTokenGGPAVAX.deployed(),
        RocketVault.deployed(),
    ]);

    // Get parameters
    let rethExchangeRate = await gogoTokenGGPAVAX.getExchangeRate.call();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketDepositPool.getBalance.call(),
            web3.eth.getBalance(rocketVault.address).then(value => web3.utils.toBN(value)),
            gogoTokenGGPAVAX.balanceOf.call(txOptions.from),
        ]).then(
            ([depositPoolEth, vaultEth, userReth]) =>
            ({depositPoolEth, vaultEth, userReth})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Deposit
    await rocketDepositPool.deposit(txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let txValue = web3.utils.toBN(txOptions.value);
    let calcBase = web3.utils.toBN(web3.utils.toWei('1', 'ether'));
    let expectedRethMinted = txValue.mul(calcBase).div(rethExchangeRate);

    // Check balances
    assert(balances2.depositPoolEth.eq(balances1.depositPoolEth.add(txValue)), 'Incorrect updated deposit pool ETH balance');
    assert(balances2.vaultEth.eq(balances1.vaultEth.add(txValue)), 'Incorrect updated vault ETH balance');
    assert(balances2.userReth.eq(balances1.userReth.add(expectedRethMinted)), 'Incorrect updated user rETH balance');

}

