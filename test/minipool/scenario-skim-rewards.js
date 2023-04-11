import {
    RocketDepositPool,
    RocketNodeManager,
    RocketTokenRETH
} from '../_utils/artifacts'
import { assertBN } from '../_helpers/bn';

export async function skimRewards(minipool, txOptions) {
    // Load contracts
    const [
        rocketTokenRETH,
        rocketNodeManager
    ] = await Promise.all([
        RocketTokenRETH.deployed(),
        RocketNodeManager.deployed(),
    ]);

    // Get parameters
    let [
        nodeAddress,
        nodeFee,
        nodeCapital,
        userCapital
    ] = await Promise.all([
        minipool.getNodeAddress.call(),
        minipool.getNodeFee.call(),
        minipool.getNodeDepositBalance.call(),
        minipool.getUserDepositBalance.call(),
    ]);

    // Get node parameters
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);

    // Get balances
    function getBalances() {
        return Promise.all([
            web3.eth.getBalance(rocketTokenRETH.address).then(value => value.BN),
            web3.eth.getBalance(nodeWithdrawalAddress).then(value => value.BN),
            web3.eth.getBalance(minipool.address).then(value => value.BN),
            minipool.getNodeRefundBalance.call(),
        ]).then(
          ([rethContractEth, nodeWithdrawalEth, minipoolEth, nodeRefundBalance]) =>
            ({rethContractEth, nodeWithdrawalEth, minipoolEth, nodeRefundBalance})
        );
    }

    // Get initial balances & withdrawal processed status
    const balances1 = await getBalances();

    const realBalance = balances1.minipoolEth.sub(balances1.nodeRefundBalance);
    assertBN.isBelow(realBalance, '8'.ether, 'Cannot skim rewards greater than 8 ETH');

    // Set gas price
    txOptions.gasPrice = '20'.gwei;

    // Payout the balances now
    let txReceipt = await minipool.distributeBalance(true, txOptions);

    let txFee = txOptions.gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));

    // Get updated balances & withdrawal processed status
    const balances2 = await getBalances();

    // Add the fee back into the balance to make assertions easier
    if (txOptions.from === nodeWithdrawalAddress) {
      balances2.nodeWithdrawalEth = balances2.nodeWithdrawalEth.add(txFee);
    }

    // Calculate actual rewards
    const nodeBalanceChange = balances2.nodeWithdrawalEth.sub(balances1.nodeWithdrawalEth);
    const nodeRefundBalanceChange = balances2.nodeRefundBalance.sub(balances2.nodeRefundBalance);
    const rethBalanceChange = balances2.rethContractEth.sub(balances1.rethContractEth);

    // Calculate expected rewards
    const rewards = balances1.minipoolEth.sub(balances1.nodeRefundBalance);
    const nodePortion = rewards.mul(nodeCapital).div(userCapital.add(nodeCapital));
    const userPortion = rewards.sub(nodePortion);
    const nodeRewards = nodePortion.add(userPortion.mul(nodeFee).div('1'.ether));
    const userRewards = rewards.sub(nodeRewards);

    // Check rETH balance has increased by expected amount
    assertBN.equal(rethBalanceChange, userRewards, 'Incorrect user rewards distributed');

    if (txOptions.from === nodeWithdrawalAddress || txOptions.from === nodeAddress) {
        // When NO calls it should send the skimmed rewards + any accured in the refund balance to withdrawal address
        assertBN.equal(nodeBalanceChange, nodeRewards.add(balances1.nodeRefundBalance), 'Incorrect node rewards distributed');
    } else {
        // When someone else calls it just accrues in refund balance
        assertBN.equal(nodeRefundBalanceChange, nodeRefundBalanceChange, 'Incorrect node rewards distributed');
    }
}
