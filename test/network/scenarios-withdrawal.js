import { RocketNetworkWithdrawal, RocketVault } from '../_utils/artifacts';


// Deposit a validator withdrawal
export async function depositWithdrawal(txOptions) {

    // Load contracts
    const [
        rocketNetworkWithdrawal,
        rocketVault,
    ] = await Promise.all([
        RocketNetworkWithdrawal.deployed(),
        RocketVault.deployed(),
    ]);

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketNetworkWithdrawal.getBalance.call(),
            web3.eth.getBalance(rocketVault.address),
        ]).then(
            ([withdrawalPoolEth, vaultEth]) =>
            ({withdrawalPoolEth, vaultEth: web3.utils.toBN(vaultEth)})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Deposit withdrawal
    await rocketNetworkWithdrawal.depositWithdrawal(txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let txValue = web3.utils.toBN(txOptions.value);

    // Check balances
    assert(balances2.withdrawalPoolEth.eq(balances1.withdrawalPoolEth.add(txValue)), 'Incorrect updated withdrawal pool balance');
    assert(balances2.vaultEth.eq(balances1.vaultEth.add(txValue)), 'Incorrect updated vault balance');

}


// Process a validator withdrawal
export async function processWithdrawal(validatorPubkey, txOptions) {

    // Load contracts
    const [
        rocketNetworkWithdrawal,
        rocketVault,
    ] = await Promise.all([
        RocketNetworkWithdrawal.deployed(),
        RocketVault.deployed(),
    ]);

    // Process withdrawal
    await rocketNetworkWithdrawal.processWithdrawal(validatorPubkey, txOptions);

}

