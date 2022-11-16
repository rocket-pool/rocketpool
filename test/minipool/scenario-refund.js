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
            web3.eth.getBalance(minipool.address).then(value => web3.utils.toBN(value)),
            web3.eth.getBalance(nodeWithdrawalAddress).then(value => web3.utils.toBN(value)),
        ]).then(
            ([nodeRefund, minipoolEth, nodeEth]) =>
            ({nodeRefund, minipoolEth, nodeEth})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Refund & get tx fee
    let txReceipt = await minipool.refund(txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated balances
    let balances2 = await getBalances();

    // Check balances
    let expectedNodeBalance = balances1.nodeEth.add(balances1.nodeRefund);
    if (nodeWithdrawalAddress === nodeAddress) expectedNodeBalance = expectedNodeBalance.sub(txFee);
    assertBN.isAbove(balances1.nodeRefund, 0, 'Incorrect initial node refund balance');
    assertBN.eq(balances2.nodeRefund, 0, 'Incorrect updated node refund balance');
    assertBN.equal(balances2.minipoolEth, balances1.minipoolEth.sub(balances1.nodeRefund), 'Incorrect updated minipool ETH balance');
    assertBN.equal(balances2.nodeEth, expectedNodeBalance, 'Incorrect updated node ETH balance');
}
