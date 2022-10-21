import { RocketNodeDeposit } from '../_utils/artifacts';


// Reduce bonding amount of a minipool
export async function reduceBond(minipool, amount, txOptions = null) {
    amount = web3.utils.toBN(amount);

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
    assert(balances1.nodeDepositBalance.sub(balances2.nodeDepositBalance).eq(amount))
    assert(balances2.userDepositBalance.sub(balances1.userDepositBalance).eq(amount))
    assert(balances2.nodeDepositCredit.sub(balances1.nodeDepositCredit).eq(amount))
}

