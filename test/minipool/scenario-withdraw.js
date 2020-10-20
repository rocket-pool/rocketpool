import { RocketTokenNETH } from '../_utils/artifacts';


// Withdraw from a minipool
export async function withdraw(minipool, txOptions) {

    // Load contracts
    let rocketTokenNETH = await RocketTokenNETH.deployed();

    // Get parameters
    let nodeAddress = await minipool.getNodeAddress.call();

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
            rocketTokenNETH.balanceOf.call(nodeAddress),
            web3.eth.getBalance(nodeAddress).then(value => web3.utils.toBN(value)),
        ]).then(
            ([neth, eth]) =>
            ({neth, eth})
        );
    }

    // Get initial node balances & minipool balances
    let [nodeBalances1, minipoolBalances] = await Promise.all([
        getNodeBalances(),
        getMinipoolBalances(),
    ]);

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Withdraw & get tx fee
    let txReceipt = await minipool.withdraw(txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated node balances & minipool contract code
    let [nodeBalances2, minipoolCode] = await Promise.all([
        getNodeBalances(),
        web3.eth.getCode(minipool.address),
    ]);

    // Check balances
    assert(nodeBalances2.neth.eq(nodeBalances1.neth.add(minipoolBalances.neth)), 'Incorrect updated node nETH balance');
    assert(nodeBalances2.eth.eq(nodeBalances1.eth.add(minipoolBalances.nodeRefund).sub(txFee)), 'Incorrect updated node ETH balance');

    // Check minipool contract code
    assert.equal(minipoolCode, '0x', 'Minipool contract was not destroyed');

}

