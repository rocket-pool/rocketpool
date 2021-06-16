import { RocketDAOProtocolSettingsNetwork, RocketDepositPool, RocketMinipoolManager, RocketNodeManager, RocketTokenRETH } from '../_utils/artifacts';


// Send validator balance to a minipool
export async function withdrawValidatorBalancePublic(minipool, random, txOptions) {

	// Load contracts
    const [
	    rocketDAOProtocolSettingsNetwork,
        rocketDepositPool,
        rocketMinipoolManager,
        rocketTokenRETH,
        rocketNodeManager
    ] = await Promise.all([
    	RocketDAOProtocolSettingsNetwork.deployed(),
        RocketDepositPool.deployed(),
        RocketMinipoolManager.deployed(),
        RocketTokenRETH.deployed(),
        RocketNodeManager.deployed(),
    ]);

    // Get node parameters
    let nodeAddress = await minipool.getNodeAddress.call();
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);

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
            web3.eth.getBalance(rocketTokenRETH.address).then(value => web3.utils.toBN(value)),
            rocketDepositPool.getBalance.call(),
            web3.eth.getBalance(nodeWithdrawalAddress).then(value => web3.utils.toBN(value)),
            web3.eth.getBalance(minipool.address).then(value => web3.utils.toBN(value)),
        ]).then(
            ([rethContractEth, depositPoolEth, nodeWithdrawalEth, minipoolEth]) =>
            ({rethContractEth, depositPoolEth, nodeWithdrawalEth, minipoolEth})
        );
    }


    // Send validator balance to minipool
    txOptions.to = minipool.address;
    txOptions.gas = 12450000;
    if(txOptions.value > 0) {
        await web3.eth.sendTransaction(txOptions);
    }

    // Get initial balances & withdrawal processed status
    let [balances1, withdrawalProcessed1] = await Promise.all([
        getBalances(),
        rocketMinipoolManager.getMinipoolWithdrawalProcessed.call(minipool.address),
    ]);

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Payout the balances now via the public payout method
    await minipool.publicPayout({
        from: random
    });


    // Get updated balances & withdrawal processed status
    let [balances2, withdrawalProcessed2] = await Promise.all([
        getBalances(),
        rocketMinipoolManager.getMinipoolWithdrawalProcessed.call(minipool.address),
    ]);

    // Check initial status
    assert.isFalse(withdrawalProcessed1, 'Incorrect initial minipool withdrawal processed status');
    assert.isFalse(withdrawalProcessed2, 'Incorrect updated minipool withdrawal processed status'); // public payout method should not set withdraw processed flag

    // Get expected user amount destination
    let expectRethDeposit = rethCollateralRate.lt(targetRethCollateralRate);

    // Check balances
    if (expectRethDeposit) {
        assert(balances2.rethContractEth.eq(balances1.rethContractEth.add(withdrawalUserAmount)), 'Incorrect updated rETH contract balance');
        assert(balances2.depositPoolEth.eq(balances1.depositPoolEth), 'Incorrect updated deposit pool balance');
    } else {
        assert(balances2.rethContractEth.eq(balances1.rethContractEth), 'Incorrect updated rETH contract balance');
        assert(balances2.depositPoolEth.eq(balances1.depositPoolEth.add(withdrawalUserAmount)), 'Incorrect updated deposit pool balance');
    }

    // Refund balance should be the withdrawal value
    let refundBalance = await minipool.getNodeRefundBalance.call();
    assert(refundBalance.eq(withdrawalNodeAmount), 'Incorrect node refund amount');

    // Call payout from node operator now and make sure node operator gets the correct payout
    let txReceipt = await minipool.payout(true, {
        from: txOptions.from
    });

    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Check withdrawal processed flag
    let [balances3, withdrawalProcessed3] = await Promise.all([
        getBalances(),
        rocketMinipoolManager.getMinipoolWithdrawalProcessed.call(minipool.address),
    ]);
    assert.isTrue(withdrawalProcessed3, 'Incorrect updated minipool withdrawal processed status'); // public payout method should not set withdraw processed flag

    // console.log('Withdrawal Amount:', web3.utils.fromWei(withdrawalTotalAmount), web3.utils.fromWei(withdrawalNodeAmount));
    // console.log('Minipool Amount:', web3.utils.fromWei(balances1.minipoolEth), web3.utils.fromWei(balances2.minipoolEth), web3.utils.fromWei(balances3.minipoolEth));
    // console.log('Node Withdrawal Address Amount:', web3.utils.fromWei(balances1.nodeWithdrawalEth), web3.utils.fromWei(balances2.nodeWithdrawalEth));
    // console.log('rETH Contract Amount:', web3.utils.fromWei(balances1.rethContractEth), web3.utils.fromWei(balances2.rethContractEth));
    // console.log('Deposit Pool Amount:', web3.utils.fromWei(balances1.depositPoolEth), web3.utils.fromWei(balances2.depositPoolEth));

    // Was it the node operator running this or the withdrawal address? We'll need to subtract the tx cost if it's the withdrawal address
    let withdrawalAmount = nodeAddress.toLowerCase() === txOptions.from.toLowerCase() ? withdrawalNodeAmount : withdrawalNodeAmount.sub(txFee);
    // Verify node withdrawal address has the expected ETH
    assert((balances3.nodeWithdrawalEth.sub(balances1.nodeWithdrawalEth)).eq(withdrawalAmount), 'Incorrect node operator withdrawal address balance');

}

