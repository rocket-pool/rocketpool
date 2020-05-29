import { RocketDepositPool, RocketDepositSettings, RocketETHToken, RocketNodeRewards, RocketPool, RocketVault } from '../_utils/artifacts';


// Make a deposit into the deposit pool
export async function deposit(txOptions) {

    // Load contracts
    const [
        rocketDepositPool,
        rocketDepositSettings,
        rocketETHToken,
        rocketNodeRewards,
        rocketPool,
        rocketVault,
    ] = await Promise.all([
        RocketDepositPool.deployed(),
        RocketDepositSettings.deployed(),
        RocketETHToken.deployed(),
        RocketNodeRewards.deployed(),
        RocketPool.deployed(),
        RocketVault.deployed(),
    ]);

    // Get parameters
    let [
        rethExchangeRate,
        depositFee,
    ] = await Promise.all([
        rocketETHToken.getExchangeRate.call(),
        rocketDepositSettings.getDepositFee.call(),
    ]);

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketDepositPool.getBalance.call(),
            rocketPool.getTotalETHBalance.call(),
            web3.eth.getBalance(rocketVault.address),
            rocketNodeRewards.getBalance.call(),
            rocketETHToken.balanceOf.call(rocketVault.address),
            rocketETHToken.balanceOf.call(txOptions.from),
        ]).then(
            ([depositPoolEth, networkEth, vaultEth, nodeRewardsReth, vaultReth, userReth]) =>
            ({depositPoolEth, networkEth, vaultEth: web3.utils.toBN(vaultEth), nodeRewardsReth, vaultReth, userReth})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Deposit
    await rocketDepositPool.deposit(txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate actual values
    let txValue = web3.utils.toBN(txOptions.value);
    let rethMinted = (balances2.vaultReth.add(balances2.userReth)).sub(balances1.vaultReth.add(balances1.userReth));

    // Calculate expected values
    let calcBase = web3.utils.toBN(web3.utils.toWei('1', 'ether'));
    let expectedRethMinted = txValue.mul(calcBase).div(rethExchangeRate);
    let expectedFeeReth = expectedRethMinted.mul(depositFee).div(calcBase);
    let expectedUserReth = expectedRethMinted.sub(expectedFeeReth);

    // Check ETH balances
    assert(balances2.depositPoolEth.eq(balances1.depositPoolEth.add(txValue)), 'Incorrect updated deposit pool ETH balance');
    assert(balances2.networkEth.eq(balances1.networkEth.add(txValue)), 'Incorrect updated network total ETH balance');
    assert(balances2.vaultEth.eq(balances1.vaultEth.add(txValue)), 'Incorrect updated vault ETH balance');

    // Check rETH balances
    assert(rethMinted.eq(expectedRethMinted), 'Incorrect amount of rETH minted');
    assert(balances2.nodeRewardsReth.eq(balances1.nodeRewardsReth.add(expectedFeeReth)), 'Incorrect updated node reward pool rETH balance');
    assert(balances2.vaultReth.eq(balances1.vaultReth.add(expectedFeeReth)), 'Incorrect updated vault rETH balance');
    assert(balances2.userReth.eq(balances1.userReth.add(expectedUserReth)), 'Incorrect updated user rETH balance');

}

