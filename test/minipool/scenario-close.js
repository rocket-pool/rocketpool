// Close a minipool
export async function close(minipool, txOptions) {

    // Get parameters
    let nodeAddress = await minipool.getNodeAddress.call();

    // Get minipool balances
    function getMinipoolBalances() {
        return Promise.all([
            minipool.getNodeDepositBalance.call(),
            minipool.getNodeRefundBalance.call(),
        ]).then(
            ([nodeDeposit, nodeRefund]) =>
            ({nodeDeposit, nodeRefund})
        );
    }

    // Get initial node balance & minipool balances
    let [nodeBalance1, minipoolBalances] = await Promise.all([
        web3.eth.getBalance(nodeAddress).then(value => web3.utils.toBN(value)),
        getMinipoolBalances(),
    ]);

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Close & get tx fee
    let txReceipt = await minipool.close(txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated node balance & minipool contract code
    let [nodeBalance2, minipoolCode] = await Promise.all([
        web3.eth.getBalance(nodeAddress).then(value => web3.utils.toBN(value)),
        web3.eth.getCode(minipool.address),
    ]);

    // Check balances
    assert(nodeBalance2.eq(nodeBalance1.add(minipoolBalances.nodeDeposit).add(minipoolBalances.nodeRefund).sub(txFee)), 'Incorrect updated node nETH balance');

    // Check minipool contract code
    assert.equal(minipoolCode, '0x', 'Minipool contract was not destroyed');

}

