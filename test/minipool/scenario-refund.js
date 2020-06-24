import {  } from '../_utils/artifacts';


// Refund refinanced node balance from a minipool
export async function refund(minipool, txOptions) {

    // Get balances
    function getBalances() {
        return Promise.all([
            minipool.getNodeRefundBalance.call(),
            web3.eth.getBalance(minipool.address),
            web3.eth.getBalance(txOptions.from),
        ]).then(
            ([nodeRefund, minipoolEth, nodeEth]) =>
            ({nodeRefund, minipoolEth: web3.utils.toBN(minipoolEth), nodeEth: web3.utils.toBN(nodeEth)})
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
    assert(balances1.nodeRefund.gt(zero), 'Incorrect initial node refund balance');
    assert(balances2.nodeRefund.eq(zero), 'Incorrect updated node refund balance');
    assert(balances2.minipoolEth.eq(balances1.minipoolEth.sub(balances1.nodeRefund)), 'Incorrect updated minipool ETH balance');
    assert(balances2.nodeEth.eq(balances1.nodeEth.add(balances1.nodeRefund).sub(txFee)), 'Incorrect updated node ETH balance');

}

