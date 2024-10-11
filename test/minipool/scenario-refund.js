import { RocketNodeManager } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

// Refund refinanced node balance from a minipool
export async function refund(minipool, txOptions) {
    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Get parameters
    let nodeAddress = await minipool.getNodeAddress();
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);

    // Get balances
    function getBalances() {
        return Promise.all([
            minipool.getNodeRefundBalance(),
            ethers.provider.getBalance(minipool.target),
            ethers.provider.getBalance(nodeWithdrawalAddress),
        ]).then(
            ([nodeRefund, minipoolEth, nodeEth]) =>
                ({ nodeRefund, minipoolEth, nodeEth }),
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Set gas price
    let gasPrice = '20'.gwei;
    txOptions.gasPrice = gasPrice;

    // Refund & get tx fee
    let tx = await minipool.connect(txOptions.from).refund(txOptions);
    let txReceipt = await tx.wait();
    let txFee = gasPrice * txReceipt.gasUsed;

    // Get updated balances
    let balances2 = await getBalances();

    // Check balances
    let expectedNodeBalance = balances1.nodeEth + balances1.nodeRefund;
    if (nodeWithdrawalAddress === nodeAddress) expectedNodeBalance = expectedNodeBalance - txFee;
    assertBN.isAbove(balances1.nodeRefund, '0'.ether, 'Incorrect initial node refund balance');
    assertBN.equal(balances2.nodeRefund, '0'.ether, 'Incorrect updated node refund balance');
    assertBN.equal(balances2.minipoolEth, balances1.minipoolEth - balances1.nodeRefund, 'Incorrect updated minipool ETH balance');
    assertBN.equal(balances2.nodeEth, expectedNodeBalance, 'Incorrect updated node ETH balance');
}
