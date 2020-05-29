import { RocketDepositPool, RocketPool, RocketVault } from '../_utils/artifacts';


// Make a deposit into the deposit pool
export async function deposit(txOptions) {

    // Load contracts
    const [
        rocketDepositPool,
        rocketPool,
        rocketVault,
    ] = await Promise.all([
        RocketDepositPool.deployed(),
        RocketPool.deployed(),
        RocketVault.deployed(),
    ]);

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketDepositPool.getBalance.call(),
            rocketPool.getTotalETHBalance.call(),
            web3.eth.getBalance(rocketVault.address),
        ]).then(
            ([depositPoolEth, networkEth, vaultEth]) =>
            ({depositPoolEth, networkEth, vaultEth: web3.utils.toBN(vaultEth)})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Deposit
    await rocketDepositPool.deposit(txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Check balances
    let txValue = web3.utils.toBN(txOptions.value);
    assert(balances2.depositPoolEth.eq(balances1.depositPoolEth.add(txValue)), 'Incorrect updated deposit pool ETH balance');
    assert(balances2.networkEth.eq(balances1.networkEth.add(txValue)), 'Incorrect updated network total ETH balance');
    assert(balances2.vaultEth.eq(balances1.vaultEth.add(txValue)), 'Incorrect updated vault ETH balance');

}

