import { RocketNodeDeposit } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Reduce bonding amount of a minipool
export async function reduceBond(minipool, amount, txOptions = null) {
    const rocketNodeDeposit = await RocketNodeDeposit.deployed();
    const node = await minipool.getNodeAddress();

    // Get minipool balances
    function getMinipoolBalances() {
        return Promise.all([
            minipool.getNodeDepositBalance.call(),
            minipool.getUserDepositBalance.call(),
            rocketNodeDeposit.getNodeDepositCredit(node)
        ]).then(
            ([nodeDepositBalance, userDepositBalance, nodeDepositCredit]) =>
                ({nodeDepositBalance, userDepositBalance, nodeDepositCredit})
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
}
