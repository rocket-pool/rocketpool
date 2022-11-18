import { RocketNodeDeposit, RocketNodeStaking } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Reduce bonding amount of a minipool
export async function reduceBond(minipool, amount, txOptions = null) {
    const rocketNodeDeposit = await RocketNodeDeposit.deployed();
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    const node = await minipool.getNodeAddress();

    // Get minipool balances
    function getMinipoolBalances() {
        return Promise.all([
            minipool.getNodeDepositBalance.call(),
            minipool.getUserDepositBalance.call(),
            rocketNodeDeposit.getNodeDepositCredit(node),
            rocketNodeStaking.getNodeETHMatched(node),
        ]).then(
            ([nodeDepositBalance, userDepositBalance, nodeDepositCredit, ethMatched]) =>
                ({nodeDepositBalance, userDepositBalance, nodeDepositCredit, ethMatched})
        );
    }

    // Record balances before and after calling reduce bond function
    const balances1 = await getMinipoolBalances();
    await minipool.reduceBondAmount(amount, txOptions);
    const balances2 = await getMinipoolBalances();

    // Verify results
    assertBN.equal(balances1.nodeDepositBalance.sub(balances2.nodeDepositBalance), amount);
    assertBN.equal(balances2.userDepositBalance.sub(balances1.userDepositBalance), amount);
    assertBN.equal(balances2.nodeDepositCredit.sub(balances1.nodeDepositCredit), amount);
    assertBN.equal(balances2.ethMatched.sub(balances1.ethMatched), amount);
}
