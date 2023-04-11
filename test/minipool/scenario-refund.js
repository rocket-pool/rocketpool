import { RocketNodeManager } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Refund refinanced node balance from a minipool
export async function refund(minipool, txOptions) {
    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Get parameters
    let nodeAddress = await minipool.getNodeAddress.call();
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);

    // Get balances
    function getBalances() {
        return Promise.all([
            minipool.getNodeRefundBalance.call(),
            web3.eth.getBalance(minipool.address).then(value => value.BN),
            web3.eth.getBalance(nodeWithdrawalAddress).then(value => value.BN),
        ]).then(
            ([nodeRefund, minipoolEth, nodeEth]) =>
            ({nodeRefund, minipoolEth, nodeEth})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Set gas price
    let gasPrice = '20'.gwei;
    txOptions.gasPrice = gasPrice;

    // Refund & get tx fee
    let txReceipt = await minipool.refund(txOptions);
    let txFee = gasPrice.mul(txReceipt.receipt.gasUsed.BN);

    // Get updated balances
    let balances2 = await getBalances();

    // Check balances
    let expectedNodeBalance = balances1.nodeEth.add(balances1.nodeRefund);
    if (nodeWithdrawalAddress === nodeAddress) expectedNodeBalance = expectedNodeBalance.sub(txFee);
    assertBN.isAbove(balances1.nodeRefund, '0'.ether, 'Incorrect initial node refund balance');
    assertBN.equal(balances2.nodeRefund, '0'.ether, 'Incorrect updated node refund balance');
    assertBN.equal(balances2.minipoolEth, balances1.minipoolEth.sub(balances1.nodeRefund), 'Incorrect updated minipool ETH balance');
    assertBN.equal(balances2.nodeEth, expectedNodeBalance, 'Incorrect updated node ETH balance');
}
