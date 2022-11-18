import { RocketNodeManager, RocketNodeStaking } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Close a minipool
export async function close(minipool, txOptions) {
    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();
    const rocketNodeStaking = await RocketNodeStaking.deployed();

    // Get parameters
    let nodeAddress = await minipool.getNodeAddress.call();
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);

    // Get initial node balance & minipool balances
    let [nodeBalance1, ethMatched1, minipoolBalance, userDepositBalance] = await Promise.all([
        web3.eth.getBalance(nodeWithdrawalAddress).then(value => value.BN),
        rocketNodeStaking.getNodeETHMatched(txOptions.from),
        web3.eth.getBalance(minipool.address).then(value => value.BN),
        minipool.getUserDepositBalance()
    ]);

    // Set gas price
    let gasPrice = '20'.gwei;
    txOptions.gasPrice = gasPrice;

    // Close & get tx fee
    let txReceipt = await minipool.close(txOptions);
    let txFee = gasPrice.mul(txReceipt.receipt.gasUsed.BN);

    // Get updated node balance & minipool contract code
    let [nodeBalance2, ethMatched2, minipoolCode] = await Promise.all([
        web3.eth.getBalance(nodeWithdrawalAddress).then(value => value.BN),
        rocketNodeStaking.getNodeETHMatched(txOptions.from),
        web3.eth.getCode(minipool.address),
    ]);

    // Check balances
    let expectedNodeBalance = nodeBalance1.add(minipoolBalance);
    if (nodeWithdrawalAddress === nodeAddress) expectedNodeBalance = expectedNodeBalance.sub(txFee);
    assertBN.equal(nodeBalance2, expectedNodeBalance, 'Incorrect updated node nETH balance');

    // Expect node's ETH matched to be decreased by userDepositBalance
    assertBN.equal(ethMatched1.sub(ethMatched2), userDepositBalance, 'Incorrect ETH matched');
}

