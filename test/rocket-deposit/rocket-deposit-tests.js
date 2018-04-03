import { printTitle, assertThrows } from '../utils';
import { RocketSettings, RocketUser } from '../artifacts';


import { RocketDepositToken } from '../artifacts';


export default function({
    owner,
    accounts,
    miniPools
}) {

    describe('RocketDepositToken', async () => {


        // Addresses
        let userFirst = accounts[1];
        let userThird = accounts[3];


        // Contract dependencies
        let rocketSettings;
        let rocketUser;
        let rocketDeposit;
        before(async () => {
            rocketSettings = await RocketSettings.deployed();
            rocketUser = await RocketUser.deployed();
            rocketDeposit = await RocketDepositToken.deployed();
        });


        it(printTitle('userThird', 'withdraws 50% of their deposit as Rocket Deposit Tokens while their minipool is staking with Casper'), async () => {

            // Get the token withdrawal fee
            const tokenWithdrawalFee = await rocketSettings.getTokenRPDWithdrawalFeePerc.call().valueOf();
            // Get the total supply of tokens in circulation
            const totalTokenSupplyStr = await rocketDeposit.totalSupply.call({ from: userThird }).valueOf();
            const totalTokenSupply = parseInt(totalTokenSupplyStr);

            // Third user deposited the min required to launch a pool earlier, we need this amount so we can calculate 50%
            const userDeposit = await miniPools.second.getUserDeposit.call(userThird).valueOf();
            const withdrawHalfAmount = parseInt(userDeposit) / 2;
            // Fee incurred on tokens
            const tokenBalanceFeeIncurred = parseFloat(web3.fromWei(tokenWithdrawalFee, 'ether') * web3.fromWei(withdrawHalfAmount, 'ether'));

            // Try to withdraw tokens from that users minipool
            await rocketUser.userWithdrawDepositTokens(miniPools.second.address, withdrawHalfAmount, {
                from: userThird,
                gas: 250000,
            });

            // Get the total supply of tokens in circulation
            const tokenWeiSupplyAfter = await rocketDeposit.totalSupply({ from: userThird }).valueOf();
            const totalTokenSupplyAfter = parseFloat(web3.fromWei(tokenWeiSupplyAfter, 'ether'));

            // Now count how many tokens that user has, should match the amount withdrawn
            const userWeiBalance = await rocketDeposit.balanceOf.call(userThird).valueOf();
            const tokenBalance = parseFloat(web3.fromWei(userWeiBalance, 'ether'));

            // Now count how many tokens that user has, should match the amount withdrawn - fees
            const userBalance = await miniPools.second.getUserDeposit.call(userThird).valueOf();
            const expectedTokenBalance = web3.fromWei(withdrawHalfAmount, 'ether') - tokenBalanceFeeIncurred;

            assert.equal(tokenBalance, expectedTokenBalance, 'Token balance does not match');
            assert.equal(totalTokenSupplyAfter, tokenBalance, 'Token supply does not match');
            assert.equal(userBalance, withdrawHalfAmount, 'User balance does not match');

        });


        it(printTitle('userThird', 'transfers half of their deposit tokens to userFirst on the open market'), async () => {

            // Count how many tokens that user has
            const userThirdTokenBalance = await rocketDeposit.balanceOf.call(userThird).valueOf();
            // Transfer half to first user on the open market
            const tokenTransferAmount = parseInt(userThirdTokenBalance) / 2;
            // Transfer now
            await rocketDeposit.transfer(userFirst, tokenTransferAmount, { from: userThird, gas: 250000 });

            // Now count how many tokens that user has
            const userThirdTokenBalanceAfter = await rocketDeposit.balanceOf.call(userThird).valueOf();
            // Now count first user balance
            const userFirstTokenBalance = await rocketDeposit.balanceOf.call(userFirst).valueOf();

            assert.equal(userThirdTokenBalanceAfter, userThirdTokenBalance - tokenTransferAmount, 'Third user token balance does not match');
            assert.equal(userFirstTokenBalance, tokenTransferAmount, 'First user token balance does not match');

        });


        it(printTitle('userThird', 'fails to transfer more tokens than they own on the open market'), async () => {

            // Count how many tokens that user has
            const userThirdTokenBalance = parseInt(await rocketDeposit.balanceOf.call(userThird).valueOf());
            // Transfer to first user on the open market
            const tokenTransferAmount = userThirdTokenBalance + 10000;
            // Transfer now
            await rocketDeposit.transfer(userFirst, tokenTransferAmount, { from: userThird, gas: 250000 });

            // Now count how many tokens that user has
            const userThirdTokenBalanceAfter = parseInt(await rocketDeposit.balanceOf.call(userThird).valueOf());

            // check that none were sent
            assert.equal(userThirdTokenBalanceAfter, userThirdTokenBalance, 'Users tokens were transferred');

        });


        it(printTitle('userThird', 'fails to transfer tokens from userFirst account to themselves on the open market'), async () => {

            // Count how many tokens that user has
            const userFirstTokenBalance = parseInt(await rocketDeposit.balanceOf.call(userFirst).valueOf());
            // Transfer to third user on the open market
            const tokenTransferAmount = userFirstTokenBalance / 2;
            // Transfer now
            await rocketDeposit.transferFrom(userFirst, userThird, tokenTransferAmount, { from: userThird, gas: 250000 });

            // Now count how many tokens that user has
            const userFirstTokenBalanceAfter = parseInt(await rocketDeposit.balanceOf.call(userFirst).valueOf());
            assert.equal(userFirstTokenBalanceAfter, userFirstTokenBalance, 'Users tokens were transferred');

        });


        it(printTitle('userThird', 'fails to trade their tokens for ether in the rocket deposit token fund as it does not have enough ether to cover the amount sent'), async () => {

            const userThirdTokenBalance = parseInt(await rocketDeposit.balanceOf.call(userThird).valueOf());
            // Transfer now
            const result = rocketDeposit.burnTokensForEther(userThirdTokenBalance, { from: userThird, gas: 250000 });
            await assertThrows(result);

        });


    });

}
