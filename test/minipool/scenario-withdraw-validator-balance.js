import {
    RocketDAOProtocolSettingsNetwork,
    RocketDepositPool,
    RocketMinipoolManager,
    RocketMinipoolPenalty,
    RocketNodeManager,
    GoGoTokenGGPAVAX
} from '../_utils/artifacts'


export async function withdrawValidatorBalance(minipool, withdrawalBalance, from, finalise = false) {
    // Convert to BN
    withdrawalBalance = web3.utils.toBN(withdrawalBalance);

    // Load contracts
    const [
        rocketDepositPool,
        gogoTokenGGPAVAX,
        rocketNodeManager
    ] = await Promise.all([
        RocketDepositPool.deployed(),
        GoGoTokenGGPAVAX.deployed(),
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
            web3.eth.getBalance(gogoTokenGGPAVAX.address).then(value => web3.utils.toBN(value)),
            rocketDepositPool.getBalance.call(),
            web3.eth.getBalance(nodeWithdrawalAddress).then(value => web3.utils.toBN(value)),
            web3.eth.getBalance(minipool.address).then(value => web3.utils.toBN(value)),
        ]).then(
          ([rethContractEth, depositPoolEth, nodeWithdrawalEth, minipoolEth]) =>
            ({rethContractEth, depositPoolEth, nodeWithdrawalEth, minipoolEth})
        );
    }

    // Get minipool balances
    function getMinipoolBalances(finalised = false) {
        if (finalised) {
            return {
                nodeDepositBalance: web3.utils.toBN('0'),
                nodeRefundBalance: web3.utils.toBN('0'),
                userDepositBalance: web3.utils.toBN('0')
            }
        }
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
    let [balances1, minipoolBalances1] = await Promise.all([
        getBalances(),
        getMinipoolBalances()
    ]);

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));

    // Payout the balances now
    let txReceipt;

    if (finalise) {
        txReceipt = await minipool.distributeBalanceAndFinalise({
            from: from,
            gasPrice: gasPrice
        });
    } else {
        txReceipt = await minipool.distributeBalance({
            from: from,
            gasPrice: gasPrice
        });
    }

    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated balances & withdrawal processed status
    let [balances2, minipoolBalances2] = await Promise.all([
        getBalances(),
        getMinipoolBalances(finalise)
    ]);

    // Add the fee back into the balance to make assertions easier
    if (from === nodeWithdrawalAddress) {
      balances2.nodeWithdrawalEth = balances2.nodeWithdrawalEth.add(txFee);
    }

    let nodeBalanceChange = balances2.nodeWithdrawalEth.add(minipoolBalances2.nodeRefundBalance).sub(balances1.nodeWithdrawalEth.add(minipoolBalances1.nodeRefundBalance));
    let rethBalanceChange = balances2.rethContractEth.sub(balances1.rethContractEth);
    let depositPoolChange = balances2.depositPoolEth.sub(balances1.depositPoolEth);

    // console.log('Node deposit balance:', web3.utils.fromWei(minipoolBalances1.nodeDepositBalance), web3.utils.fromWei(minipoolBalances2.nodeDepositBalance));
    // console.log('Node refund balance:', web3.utils.fromWei(minipoolBalances1.nodeRefundBalance), web3.utils.fromWei(minipoolBalances2.nodeRefundBalance));
    // console.log('User deposit balance:', web3.utils.fromWei(minipoolBalances1.userDepositBalance), web3.utils.fromWei(minipoolBalances2.userDepositBalance));
    // console.log('Node fee:', web3.utils.fromWei(nodeFee));
    // console.log('Minipool Amount:', web3.utils.fromWei(balances1.minipoolEth), web3.utils.fromWei(balances2.minipoolEth), web3.utils.fromWei(balances2.minipoolEth.sub(balances1.minipoolEth)));
    // console.log('Node Withdrawal Address Amount:', web3.utils.fromWei(balances1.nodeWithdrawalEth), web3.utils.fromWei(balances2.nodeWithdrawalEth), web3.utils.fromWei(balances2.nodeWithdrawalEth.sub(balances1.nodeWithdrawalEth)));
    // console.log('rETH Contract Amount:', web3.utils.fromWei(balances1.rethContractEth), web3.utils.fromWei(balances2.rethContractEth), web3.utils.fromWei(balances2.rethContractEth.sub(balances1.rethContractEth)));

    // Get penalty rate for this minipool
    const rocketMinipoolPenalty = await RocketMinipoolPenalty.deployed();
    const penaltyRate = await rocketMinipoolPenalty.getPenaltyRate(minipool.address);

    // Calculate rewards
    let depositBalance = web3.utils.toBN(web3.utils.toWei('32'));
    if (withdrawalBalance.gte(depositBalance)) {
        let depositType = await minipool.getDepositType();
        let userAmount = minipoolBalances1.userDepositBalance;
        let rewards = withdrawalBalance.sub(depositBalance);
        let halfRewards = rewards.divn(2);
        let nodeCommissionFee = halfRewards.mul(nodeFee).div(web3.utils.toBN(web3.utils.toWei('1')));
        if (depositType.toString() === '3'){
            // Unbonded
            userAmount = userAmount.add(rewards.sub(nodeCommissionFee));
        } else {
            userAmount = userAmount.add(halfRewards.sub(nodeCommissionFee));
        }
        let nodeAmount = withdrawalBalance.sub(userAmount);

        // Adjust amounts according to penalty rate
        if (penaltyRate.gt(0)) {
            let penaltyAmount = nodeAmount.mul(penaltyRate).div(web3.utils.toBN(web3.utils.toWei('1')));
            if (penaltyRate.gt(nodeAmount)) {
                penaltyAmount = nodeAmount;
            }
            nodeAmount = nodeAmount.sub(penaltyAmount);
            userAmount = userAmount.add(penaltyAmount);
        }

        // console.log('Rewards: ', web3.utils.fromWei(rewards));
        // console.log('Node amount: ', web3.utils.fromWei(nodeAmount));
        // console.log('User amount: ', web3.utils.fromWei(userAmount));

        // Check balances
        assert(rethBalanceChange.add(depositPoolChange).eq(userAmount), "rETH balance was not correct");
        assert(nodeBalanceChange.eq(nodeAmount), "Node balance was not correct");

        // If not sent from node operator then refund balance should be correct
        if (!(from === nodeWithdrawalAddress || from === nodeAddress)) {
            let refundBalance = await minipool.getNodeRefundBalance.call();
            // console.log('Node refund balance after withdrawal:', web3.utils.fromWei(refundBalance));
            assert(refundBalance.eq(minipoolBalances1.nodeRefundBalance.add(nodeAmount)), "Node balance was not correct");
        }
    }

    return {
        nodeBalanceChange,
        rethBalanceChange
    }
}
