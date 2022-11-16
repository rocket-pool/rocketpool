import { RocketNodeManager } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Close a minipool
export async function close(minipool, txOptions) {
    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Get parameters
    let nodeAddress = await minipool.getNodeAddress.call();
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);

    // Get initial node balance & minipool balances
    let [nodeBalance1, minipoolBalance] = await Promise.all([
        web3.eth.getBalance(nodeWithdrawalAddress).then(value => web3.utils.toBN(value)),
        web3.eth.getBalance(minipool.address).then(value => web3.utils.toBN(value)),
    ]);

    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Close & get tx fee
    let txReceipt = await minipool.close(txOptions);
    let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated node balance & minipool contract code
    let [nodeBalance2, minipoolCode] = await Promise.all([
        web3.eth.getBalance(nodeWithdrawalAddress).then(value => web3.utils.toBN(value)),
        web3.eth.getCode(minipool.address),
    ]);

    // Check balances
    let expectedNodeBalance = nodeBalance1.add(minipoolBalance);
    if (nodeWithdrawalAddress === nodeAddress) expectedNodeBalance = expectedNodeBalance.sub(txFee);
    assertBN.equal(nodeBalance2, expectedNodeBalance, 'Incorrect updated node nETH balance');
}

