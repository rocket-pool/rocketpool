import { RocketMinipoolBondReducer, RocketNodeDeposit, RocketNodeStaking } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


// Reduce bonding amount of a minipool
export async function reduceBond(minipool, txOptions = null) {
    const rocketNodeDeposit = await RocketNodeDeposit.deployed();
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
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

    // Get new bond amount
    const amount = await rocketMinipoolBondReducer.getReduceBondValue(minipool.address);

    // Record balances before and after calling reduce bond function
    const balances1 = await getMinipoolBalances();
    await minipool.reduceBondAmount(txOptions);
    const balances2 = await getMinipoolBalances();

    const delta = balances1.nodeDepositBalance.sub(amount);

    // Verify results
    assertBN.equal(balances2.nodeDepositBalance, delta);
    assertBN.equal(balances2.userDepositBalance.sub(balances1.userDepositBalance), delta);
    assertBN.equal(balances2.nodeDepositCredit.sub(balances1.nodeDepositCredit), delta);
    assertBN.equal(balances2.ethMatched.sub(balances1.ethMatched), delta);
}
