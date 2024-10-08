import { RocketNodeManager, RocketTokenRETH } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

export async function skimRewards(minipool, txOptions) {
    // Load contracts
    const [
        rocketTokenRETH,
        rocketNodeManager,
    ] = await Promise.all([
        RocketTokenRETH.deployed(),
        RocketNodeManager.deployed(),
    ]);

    // Get parameters
    let [
        nodeAddress,
        nodeFee,
        nodeCapital,
        userCapital,
    ] = await Promise.all([
        minipool.getNodeAddress(),
        minipool.getNodeFee(),
        minipool.getNodeDepositBalance(),
        minipool.getUserDepositBalance(),
    ]);

    // Get node parameters
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);

    // Get balances
    function getBalances() {
        return Promise.all([
            ethers.provider.getBalance(rocketTokenRETH.target),
            ethers.provider.getBalance(nodeWithdrawalAddress),
            ethers.provider.getBalance(minipool.target),
            minipool.getNodeRefundBalance(),
        ]).then(
            ([rethContractEth, nodeWithdrawalEth, minipoolEth, nodeRefundBalance]) =>
                ({ rethContractEth, nodeWithdrawalEth, minipoolEth, nodeRefundBalance }),
        );
    }

    // Get initial balances & withdrawal processed status
    const balances1 = await getBalances();

    const realBalance = balances1.minipoolEth - balances1.nodeRefundBalance;
    assertBN.isBelow(realBalance, '8'.ether, 'Cannot skim rewards greater than 8 ETH');

    // Set gas price
    txOptions.gasPrice = '20'.gwei;

    // Payout the balances now
    let tx = await minipool.connect(txOptions.from).distributeBalance(true, txOptions);
    let txReceipt = await tx.wait();

    let txFee = txOptions.gasPrice * txReceipt.gasUsed;

    // Get updated balances & withdrawal processed status
    const balances2 = await getBalances();

    // Add the fee back into the balance to make assertions easier
    if (txOptions.from === nodeWithdrawalAddress) {
        balances2.nodeWithdrawalEth = balances2.nodeWithdrawalEth + txFee;
    }

    // Calculate actual rewards
    const nodeBalanceChange = balances2.nodeWithdrawalEth - balances1.nodeWithdrawalEth;
    const nodeRefundBalanceChange = balances2.nodeRefundBalance - balances2.nodeRefundBalance;
    const rethBalanceChange = balances2.rethContractEth - balances1.rethContractEth;

    // Calculate expected rewards
    const rewards = balances1.minipoolEth - balances1.nodeRefundBalance;
    const nodePortion = rewards * nodeCapital / (userCapital + nodeCapital);
    const userPortion = rewards - nodePortion;
    const nodeRewards = nodePortion + (userPortion * nodeFee / '1'.ether);
    const userRewards = rewards - nodeRewards;

    // Check rETH balance has increased by expected amount
    assertBN.equal(rethBalanceChange, userRewards, 'Incorrect user rewards distributed');

    if (txOptions.from === nodeWithdrawalAddress || txOptions.from === nodeAddress) {
        // When NO calls it should send the skimmed rewards + any accured in the refund balance to withdrawal address
        assertBN.equal(nodeBalanceChange, nodeRewards + balances1.nodeRefundBalance, 'Incorrect node rewards distributed');
    } else {
        // When someone else calls it just accrues in refund balance
        assertBN.equal(nodeRefundBalanceChange, nodeRefundBalanceChange, 'Incorrect node rewards distributed');
    }
}
