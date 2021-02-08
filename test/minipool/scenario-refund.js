import { RocketNodeManager } from '../_utils/artifacts';


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
    const zero = web3.utils.toBN(0);
    let expectedNodeBalance = balances1.nodeEth.add(balances1.nodeRefund);
    if (nodeWithdrawalAddress == nodeAddress) expectedNodeBalance = expectedNodeBalance.sub(txFee);
    assert(balances1.nodeRefund.gt(zero), 'Incorrect initial node refund balance');
    assert(balances2.nodeRefund.eq(zero), 'Incorrect updated node refund balance');
    assert(balances2.minipoolEth.eq(balances1.minipoolEth.sub(balances1.nodeRefund)), 'Incorrect updated minipool ETH balance');
    assert(balances2.nodeEth.eq(expectedNodeBalance), 'Incorrect updated node ETH balance');

}

