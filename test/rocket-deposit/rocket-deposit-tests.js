import { printTitle, assertThrows } from '../utils';
import { scenarioWithdrawDepositTokens } from './rocket-deposit-scenarios';


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
        let rocketDeposit;
        before(async () => {
            rocketDeposit = await RocketDepositToken.deployed();
        });


        it(printTitle('userThird', 'withdraws 50% of their deposit as Rocket Deposit Tokens while their minipool is staking with Casper'), async () => {

            // Third user deposited the min required to launch a pool earlier, we need this amount so we can calculate 50%
            const userDeposit = await miniPools.second.getUserDeposit.call(userThird);
            const withdrawHalfAmount = parseInt(userDeposit.valueOf()) / 2;

            // Withdraw tokens from user's minipool
            await scenarioWithdrawDepositTokens({
                miniPool: miniPools.second,
                withdrawalAmount: withdrawHalfAmount,
                fromAddress: userThird,
                gas: 250000,
            });

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
