import { RocketDepositPool, RocketVault } from '../_utils/artifacts';


// Make a deposit into the deposit pool
export async function deposit({from, value}) {

    // Load contracts
    const [
        rocketDepositPool,
        rocketVault,
    ] = await Promise.all([
        RocketDepositPool.deployed(),
        RocketVault.deployed(),
    ]);

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketDepositPool.getBalance.call(),
            web3.eth.getBalance(rocketVault.address),
        ]).then(
            ([depositPool, vault]) =>
            ({depositPool, vault})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Deposit
    await rocketDepositPool.deposit({from, value});

    // Get updated balances
    let balances2 = await getBalances();

    // Check balances
    assert.equal(parseInt(balances2.depositPool), parseInt(balances1.depositPool) + parseInt(value), 'Incorrect updated deposit pool balance');
    assert.equal(parseInt(balances2.vault), parseInt(balances1.vault) + parseInt(value), 'Incorrect updated vault balance');

}

