import { RocketNodeManager, RocketNodeStaking } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

// Close a minipool
export async function close(minipool, txOptions) {
    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();
    const rocketNodeStaking = await RocketNodeStaking.deployed();

    // Get parameters
    let nodeAddress = await minipool.getNodeAddress();
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);

    // Get initial node balance & minipool balances
    let [nodeBalance1, ethBorrowed1, minipoolBalance, userDepositBalance] = await Promise.all([
        ethers.provider.getBalance(nodeWithdrawalAddress),
        rocketNodeStaking.getNodeETHBorrowed(txOptions.from),
        ethers.provider.getBalance(minipool.target),
        minipool.getUserDepositBalance(),
    ]);

    // Set gas price
    let gasPrice = '20'.gwei;
    txOptions.gasPrice = gasPrice;

    // Close & get tx fee
    let tx = await minipool.connect(txOptions.from).close(txOptions);
    let txReceipt = await tx.wait();
    let txFee = gasPrice * txReceipt.gasUsed;

    // Get updated node balance & minipool contract code
    let [nodeBalance2, ethBorrowed2] = await Promise.all([
        ethers.provider.getBalance(nodeWithdrawalAddress),
        rocketNodeStaking.getNodeETHBorrowed(txOptions.from),
    ]);

    // Check balances
    let expectedNodeBalance = nodeBalance1 + minipoolBalance;
    if (nodeWithdrawalAddress === nodeAddress) expectedNodeBalance = expectedNodeBalance - txFee;
    assertBN.equal(nodeBalance2, expectedNodeBalance, 'Incorrect updated node nETH balance');

    // Expect node's ETH borrowed to be decreased by userDepositBalance
    assertBN.equal(ethBorrowed1 - ethBorrowed2, userDepositBalance, 'Incorrect ETH borrowed');
}

