import {
    RocketDepositPool,
    RocketMinipoolPenalty,
    RocketNodeManager,
    RocketTokenRETH
} from '../_utils/artifacts'
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

export async function withdrawValidatorBalance(minipool, withdrawalBalance, from) {
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
    let nodeAddress = await minipool.getNodeAddress();
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);

    // Get parameters
    let [
        nodeFee
    ] = await Promise.all([
        minipool.getNodeFee(),
    ]);

    // Get balances
    function getBalances() {
        return Promise.all([
            ethers.provider.getBalance(rocketTokenRETH.target),
            rocketDepositPool.getBalance(),
            ethers.provider.getBalance(nodeWithdrawalAddress),
            ethers.provider.getBalance(minipool.target),
        ]).then(
          ([rethContractEth, depositPoolEth, nodeWithdrawalEth, minipoolEth]) =>
            ({rethContractEth, depositPoolEth, nodeWithdrawalEth, minipoolEth})
        );
    }

    // Get minipool balances
    function getMinipoolBalances() {
        return Promise.all([
            minipool.getNodeDepositBalance(),
            minipool.getNodeRefundBalance(),
            minipool.getUserDepositBalance(),
        ]).then(
          ([nodeDepositBalance, nodeRefundBalance, userDepositBalance]) =>
            ({nodeDepositBalance, nodeRefundBalance, userDepositBalance})
        );
    }

    // Send validator balance to minipool
    if (withdrawalBalance > 0n) {
        await from.sendTransaction({
            to: minipool.target,
            gas: 12450000,
            value: withdrawalBalance
        });
    }

    // Get total withdrawal balance
    withdrawalBalance = await ethers.provider.getBalance(minipool.target);

    // Get initial balances & withdrawal processed status
    let [balances1, minipoolBalances1] = await Promise.all([
        getBalances(),
        getMinipoolBalances()
    ]);

    // Set gas price
    let gasPrice = '20'.gwei;

    // Payout the balances now
    let tx = await minipool.connect(from).distributeBalance(false, {
        from: from,
        gasPrice: gasPrice
    });

    const txReceipt = await tx.wait();

    let txFee = gasPrice * txReceipt.gasUsed;

    // Get updated balances & withdrawal processed status
    let [balances2, minipoolBalances2] = await Promise.all([
        getBalances(),
        getMinipoolBalances()
    ]);

    // Add the fee back into the balance to make assertions easier
    if (from.address === nodeWithdrawalAddress) {
      balances2.nodeWithdrawalEth = balances2.nodeWithdrawalEth + txFee;
    }

    let nodeBalanceChange = balances2.nodeWithdrawalEth + minipoolBalances2.nodeRefundBalance - balances1.nodeWithdrawalEth + minipoolBalances1.nodeRefundBalance;
    let rethBalanceChange = balances2.rethContractEth - balances1.rethContractEth;
    let depositPoolChange = balances2.depositPoolEth - balances1.depositPoolEth;

    // Get penalty rate for this minipool
    const rocketMinipoolPenalty = await RocketMinipoolPenalty.deployed();
    const penaltyRate = await rocketMinipoolPenalty.getPenaltyRate(minipool.target);

    // Calculate rewards
    let depositBalance = '32'.ether;
    if (withdrawalBalance >= depositBalance) {
        let depositType = await minipool.getDepositType();
        let userAmount = minipoolBalances1.userDepositBalance;
        let rewards = withdrawalBalance - depositBalance;
        if (depositType.toString() === '3'){
            // Unbonded
            let halfRewards = rewards / 2n;
            let nodeCommissionFee = halfRewards * nodeFee / '1'.ether;
            userAmount = userAmount + rewards - nodeCommissionFee;
        } else if (depositType.toString() === '2' || depositType.toString() === '1'){
            // Half or full
            let halfRewards = rewards.divn(2);
            let nodeCommissionFee = halfRewards * nodeFee / '1'.ether;
            userAmount = userAmount + halfRewards - nodeCommissionFee;
        } else if (depositType.toString() === '4') {
            // Variable
            const nodeCapital = minipoolBalances1.nodeDepositBalance;
            let nodeRewards = rewards * nodeCapital / (userAmount + nodeCapital);
            nodeRewards = nodeRewards + ((rewards - nodeRewards) * nodeFee / '1'.ether);
            userAmount = userAmount + rewards - nodeRewards;
        }
        let nodeAmount = withdrawalBalance - userAmount;

        // Adjust amounts according to penalty rate
        if (penaltyRate > 0n) {
            let penaltyAmount = nodeAmount * penaltyRate / '1'.ether;
            if (penaltyRate > nodeAmount) {
                penaltyAmount = nodeAmount;
            }
            nodeAmount = nodeAmount - penaltyAmount;
            userAmount = userAmount + penaltyAmount;
        }

        // Check balances
        assertBN.equal(rethBalanceChange + depositPoolChange, userAmount, "rETH balance was not correct");
        assertBN.equal(nodeBalanceChange, nodeAmount, "Node balance was not correct");

        // If not sent from node operator then refund balance should be correct
        if (!(from.address === nodeWithdrawalAddress || from.address === nodeAddress)) {
            let refundBalance = await minipool.getNodeRefundBalance();
            // console.log('Node refund balance after withdrawal:', web3.utils.fromWei(refundBalance));
            assertBN.equal(refundBalance, minipoolBalances1.nodeRefundBalance + nodeAmount, "Node balance was not correct");
        }
    }

    return {
        nodeBalanceChange,
        rethBalanceChange,
        depositPoolChange,
    }
}

export async function beginUserDistribute(minipool, txOptions) {
    await minipool.connect(txOptions.from).beginUserDistribute(txOptions);
}
