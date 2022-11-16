import { RocketTokenRPL } from '../_utils/artifacts';
import { RocketTokenDummyRPL } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

// Burn current fixed supply RPL for new RPL
export async function burnFixedRPL(amount, txOptions) {
    // Load contracts
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    const rocketTokenDummyRPL = await RocketTokenDummyRPL.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketTokenDummyRPL.balanceOf.call(txOptions.from),
            rocketTokenRPL.totalSupply.call(),
            rocketTokenRPL.balanceOf.call(txOptions.from),
            rocketTokenDummyRPL.balanceOf.call(rocketTokenRPL.address),
            rocketTokenRPL.balanceOf.call(rocketTokenRPL.address),
        ]).then(
            ([rplFixedUserBalance, rplTokenSupply, rplUserBalance, rplContractBalanceOfFixedSupply, rplContractBalanceOfSelf]) =>
            ({rplFixedUserBalance, rplTokenSupply, rplUserBalance, rplContractBalanceOfFixedSupply, rplContractBalanceOfSelf})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Burn tokens & get tx fee
    await rocketTokenRPL.swapTokens(amount, txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let mintAmount = web3.utils.toBN(amount);

    // Check balances
    assertBN.equal(balances2.rplUserBalance, balances1.rplUserBalance.add(mintAmount), 'Incorrect updated user token balance');
    assertBN.equal(balances2.rplContractBalanceOfSelf, balances1.rplContractBalanceOfSelf.sub(mintAmount), 'RPL contract has not sent the RPL to the user address');
}
