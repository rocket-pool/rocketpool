import { RocketDAOProtocolSettingsNetwork, RocketDepositPool, RocketMinipoolManager, RocketNodeManager, RocketTokenRETH } from '../_utils/artifacts';


export async function withdrawValidatorBalance(minipool, withdrawalBalance, from, destroy = false) {
    // Convert to BN
    withdrawalBalance = web3.utils.toBN(withdrawalBalance);

    // Load contracts
    const [
        rocketDepositPool,
        rocketTokenRETH,
        rocketNodeManager
    ] = await Promise.all([
        RocketDepositPool.deployed(),
        RocketTokenRETH.deployed(),
        RocketNodeManager.deployed(),
    ]);

    // Get node parameters
    let nodeAddress = await minipool.getNodeAddress.call();
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);

    // Get parameters
    let [
        nodeFee
    ] = await Promise.all([
        minipool.getNodeFee.call(),
    ]);

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

    // Get minipool balances
    function getMinipoolBalances() {
        return Promise.all([
            minipool.getNodeDepositBalance.call(),
            minipool.getNodeRefundBalance.call(),
            minipool.getUserDepositBalance.call(),
        ]).then(
          ([nodeDepositBalance, nodeRefundBalance, userDepositBalance]) =>
            ({nodeDepositBalance, nodeRefundBalance, userDepositBalance})
        );
    }

    // Send validator balance to minipool
    if (withdrawalBalance.gt('0')) {
        await web3.eth.sendTransaction({
            from: from,
            to: minipool.address,
            gas: 12450000,
            value: withdrawalBalance
        });
    }

    // Get total withdrawal balance
    withdrawalBalance = web3.utils.toBN(await web3.eth.getBalance(minipool.address));

    // Get initial balances & withdrawal processed status
    let [balances1] = await Promise.all([
        getBalances()
    ]);

    // Get minipool balances
    let minipoolBalances = await getMinipoolBalances();

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));

    // Payout the balances now
    let txReceipt;

    if (destroy) {
        txReceipt = await minipool.processWithdrawalAndDestroy({
            from: from,
            gasPrice: gasPrice
        });
    } else {
        txReceipt = await minipool.processWithdrawal({
            from: from,
            gasPrice: gasPrice
        });
    }

    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated balances & withdrawal processed status
    let [balances2] = await Promise.all([
        getBalances()
    ]);

    // Add the fee back into the balance to make assertions easier
    if (from === nodeWithdrawalAddress) {
      balances2.nodeWithdrawalEth = balances2.nodeWithdrawalEth.add(txFee);
    }

    // console.log('Node deposit balance:', web3.utils.fromWei(minipoolBalances.nodeDepositBalance));
    // console.log('Node refund balance:', web3.utils.fromWei(minipoolBalances.nodeRefundBalance));
    // console.log('User deposit balance:', web3.utils.fromWei(minipoolBalances.userDepositBalance));
    // console.log('Node fee:', web3.utils.fromWei(nodeFee));
    // console.log('Minipool Amount:', web3.utils.fromWei(balances1.minipoolEth), web3.utils.fromWei(balances2.minipoolEth), web3.utils.fromWei(balances2.minipoolEth.sub(balances1.minipoolEth)));
    // console.log('Node Withdrawal Address Amount:', web3.utils.fromWei(balances1.nodeWithdrawalEth), web3.utils.fromWei(balances2.nodeWithdrawalEth), web3.utils.fromWei(balances2.nodeWithdrawalEth.sub(balances1.nodeWithdrawalEth)));
    // console.log('rETH Contract Amount:', web3.utils.fromWei(balances1.rethContractEth), web3.utils.fromWei(balances2.rethContractEth), web3.utils.fromWei(balances2.rethContractEth.sub(balances1.rethContractEth)));

    let minipoolBalanceChange = balances2.minipoolEth.sub(balances1.minipoolEth);
    let nodeBalanceChange = balances2.nodeWithdrawalEth.sub(balances1.nodeWithdrawalEth);
    let rethBalanceChange = balances2.rethContractEth.sub(balances1.rethContractEth);

    // Calculate rewards
    let depositBalance = web3.utils.toBN(web3.utils.toWei('32'));
    if (withdrawalBalance.gte(depositBalance)) {
        let userAmount = minipoolBalances.userDepositBalance;
        let rewards = withdrawalBalance.sub(depositBalance);
        let halfRewards = rewards.divn(2);
        let nodeCommissionFee = halfRewards.mul(nodeFee).div(web3.utils.toBN(web3.utils.toWei('1')));
        userAmount = userAmount.add(halfRewards.sub(nodeCommissionFee));
        let nodeAmount = withdrawalBalance.sub(userAmount);

        // console.log('Rewards: ', web3.utils.fromWei(rewards));
        // console.log('Node amount: ', web3.utils.fromWei(nodeAmount));
        // console.log('User amount: ', web3.utils.fromWei(userAmount));

        // Check balances
        assert(rethBalanceChange.eq(userAmount), "rETH balance was not correct");

        if (from === nodeWithdrawalAddress || from === nodeAddress) {
            // Node only gets ETH right away if it was them who called
            assert(nodeBalanceChange.eq(nodeAmount), "Node balance was not correct");
        } else {
            // Otherwise the refund balance should be updated
            assert(nodeBalanceChange.toNumber() === 0, "Node balance was not correct");

            let refundBalance = await minipool.getNodeRefundBalance.call();
            // console.log('Node refund balance after withdrawal:', web3.utils.fromWei(refundBalance));
            assert(refundBalance.eq(minipoolBalances.nodeRefundBalance.add(nodeAmount)), "Node balance was not correct");
        }
    }

    // Return results
    return {
        minipoolBalanceChange,
        nodeBalanceChange,
        rethBalanceChange
    }
}
