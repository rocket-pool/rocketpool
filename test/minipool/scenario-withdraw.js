import { RocketNodeManager, RocketTokenNETH } from '../_utils/artifacts';


// Withdraw from a minipool
export async function withdraw(minipool, txOptions) {

    // Load contracts
    const [rocketNodeManager, rocketTokenNETH] = await Promise.all([
        RocketNodeManager.deployed(),
        RocketTokenNETH.deployed(),
    ]);

    // Get parameters
    let nodeAddress = await minipool.getNodeAddress.call();
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);

    // Get minipool balances
    function getMinipoolBalances() {
        return Promise.all([
            rocketTokenNETH.balanceOf.call(minipool.address),
            minipool.getNodeRefundBalance.call(),
        ]).then(
            ([neth, nodeRefund]) =>
            ({neth, nodeRefund})
        );
    }

    // Get node balances
    function getNodeBalances() {
        return Promise.all([
            rocketTokenNETH.balanceOf.call(nodeWithdrawalAddress),
            web3.eth.getBalance(nodeWithdrawalAddress).then(value => web3.utils.toBN(value)),
        ]).then(
            ([neth, eth]) =>
            ({neth, eth})
        );
    }

    // Get initial node balances, minipool balances & node withdrawn status
    let [nodeBalances1, minipoolBalances, nodeWithdrawn1] = await Promise.all([
        getNodeBalances(),
        getMinipoolBalances(),
        minipool.getNodeWithdrawn.call(),
    ]);

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Withdraw & get tx fee
    let txReceipt = await minipool.withdraw(txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated node balances & node withdrawn status
    let [nodeBalances2, nodeWithdrawn2] = await Promise.all([
        getNodeBalances(),
        minipool.getNodeWithdrawn.call(),
    ]);

    // Check minipool node withdrawn status
    assert.isFalse(nodeWithdrawn1, 'Incorrect initial minipool node withdrawn status');
    assert.isTrue(nodeWithdrawn2, 'Incorrect updated minipool node withdrawn status');

    // Check balances
    let expectedNodeEthBalance = nodeBalances1.eth.add(minipoolBalances.nodeRefund);
    if (nodeWithdrawalAddress == nodeAddress) expectedNodeEthBalance = expectedNodeEthBalance.sub(txFee);
    assert(nodeBalances2.neth.eq(nodeBalances1.neth.add(minipoolBalances.neth)), 'Incorrect updated node nETH balance');
    assert(nodeBalances2.eth.eq(expectedNodeEthBalance), 'Incorrect updated node ETH balance');

}

