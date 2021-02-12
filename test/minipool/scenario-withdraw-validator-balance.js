import { RocketDAOProtocolSettingsNetwork, RocketDepositPool, RocketMinipoolManager, RocketTokenNETH, RocketTokenRETH } from '../_utils/artifacts';


// Send validator balance to a minipool
export async function withdrawValidatorBalance(minipool, txOptions) {

	// Load contracts
    const [
	    rocketDAOProtocolSettingsNetwork,
        rocketDepositPool,
        rocketMinipoolManager,
        rocketTokenNETH,
        rocketTokenRETH,
    ] = await Promise.all([
    	RocketDAOProtocolSettingsNetwork.deployed(),
        RocketDepositPool.deployed(),
        RocketMinipoolManager.deployed(),
        RocketTokenNETH.deployed(),
        RocketTokenRETH.deployed(),
    ]);

    // Get parameters
    let [
        rethCollateralRate,
        targetRethCollateralRate,
    ] = await Promise.all([
        rocketTokenRETH.getCollateralRate.call(),
        rocketDAOProtocolSettingsNetwork.getTargetRethCollateralRate.call(),
    ]);

    // Get minipool details
    let [
        withdrawalTotalAmount,
        withdrawalNodeAmount,
    ] = await Promise.all([
        rocketMinipoolManager.getMinipoolWithdrawalTotalBalance.call(minipool.address),
        rocketMinipoolManager.getMinipoolWithdrawalNodeBalance.call(minipool.address),
    ]);
    let withdrawalUserAmount = withdrawalTotalAmount.sub(withdrawalNodeAmount);

    // Get balances
    function getBalances() {
        return Promise.all([
            web3.eth.getBalance(rocketTokenNETH.address).then(value => web3.utils.toBN(value)),
            web3.eth.getBalance(rocketTokenRETH.address).then(value => web3.utils.toBN(value)),
            rocketDepositPool.getBalance.call(),
        ]).then(
            ([nethContractEth, rethContractEth, depositPoolEth]) =>
            ({nethContractEth, rethContractEth, depositPoolEth})
        );
    }

    // Get initial balances & withdrawal processed status
    let [balances1, balanceWithdrawn1, withdrawalProcessed1] = await Promise.all([
        getBalances(),
        minipool.getValidatorBalanceWithdrawn.call(),
        rocketMinipoolManager.getMinipoolWithdrawalProcessed.call(minipool.address),
    ]);

	// Send validator balance to minipool
	txOptions.to = minipool.address;
    txOptions.gas = 12450000;
    await web3.eth.sendTransaction(txOptions);

    // Get updated balances & withdrawal processed status
    let [balances2, balanceWithdrawn2, withdrawalProcessed2] = await Promise.all([
        getBalances(),
        minipool.getValidatorBalanceWithdrawn.call(),
        rocketMinipoolManager.getMinipoolWithdrawalProcessed.call(minipool.address),
    ]);

    // Get expected user amount destination
    let expectRethDeposit = rethCollateralRate.lt(targetRethCollateralRate);

    // Check minipool balance withdrawn status
    assert.isFalse(balanceWithdrawn1, 'Incorrect initial minipool validator balance withdrawn status');
    assert.isTrue(balanceWithdrawn2, 'Incorrect updated minipool validator balance withdrawn status');

    // Check minipool withdrawal processed status
    assert.isFalse(withdrawalProcessed1, 'Incorrect initial minipool withdrawal processed status');
    assert.isTrue(withdrawalProcessed2, 'Incorrect updated minipool withdrawal processed status');

    // Check balances
    assert(balances2.nethContractEth.eq(balances1.nethContractEth.add(withdrawalNodeAmount)), 'Incorrect updated nETH contract balance');
    if (expectRethDeposit) {
        assert(balances2.rethContractEth.eq(balances1.rethContractEth.add(withdrawalUserAmount)), 'Incorrect updated rETH contract balance');
        assert(balances2.depositPoolEth.eq(balances1.depositPoolEth), 'Incorrect updated deposit pool balance');
    } else {
        assert(balances2.rethContractEth.eq(balances1.rethContractEth), 'Incorrect updated rETH contract balance');
        assert(balances2.depositPoolEth.eq(balances1.depositPoolEth.add(withdrawalUserAmount)), 'Incorrect updated deposit pool balance');
    }

}

