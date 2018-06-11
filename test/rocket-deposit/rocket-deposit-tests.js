import { printTitle, assertThrows, soliditySha3 } from '../_lib/utils/general';
import { RocketDepositToken, RocketSettings, RocketPool, RocketPoolMini, RocketStorage } from '../_lib/artifacts'
import { initialiseMiniPool } from '../rocket-user/rocket-user-utils';
import { launchMiniPools } from '../rocket-node/rocket-node-utils';
import { scenarioNodeLogoutForWithdrawal } from '../rocket-node/rocket-node-validator/rocket-node-validator-scenarios';
import { initialisePartnerUser } from '../rocket-partner-api/rocket-partner-api-utils';
import { scenarioWithdrawDepositTokens, scenarioBurnDepositTokens, scenarioTransferDepositTokens, scenarioTransferDepositTokensFrom, scenarioApproveDepositTokenTransferFrom } from './rocket-deposit-scenarios';
import { casperEpochInitialise, casperEpochIncrementAmount } from '../_lib/casper/casper';

export default function({owner}) {

    const nodeLogoutGas = 1600000;

    contract('RocketDeposit', async (accounts) => {


        /**
         * Config
         */

        // User addresses
        const userFirst = accounts[1];
        const userSecond = accounts[2];
        const userThird = accounts[3];
        const partnerFirstUserAccount = accounts[4];

        // Partner addresses
        const partnerFirst = accounts[5];

        // Node addresses
        const nodeFirst = accounts[8];
        const nodeSecond = accounts[9];

        // Minipools
        let miniPools = {};


        /**
         * RPD withdrawals
         */
        describe('Withdrawals', async () => {

            // Contract dependencies
            let rocketPool;
            before(async () => {
                rocketPool = await RocketPool.deployed();
            });


            // Initialise minipools
            before(async () => {
                miniPools.first = await initialiseMiniPool({fromAddress: userFirst});
                miniPools.second = await initialiseMiniPool({fromAddress: userThird});
            });


            // Initialise user managed by partner
            before(async () => {
                await initialisePartnerUser({
                    userAddress: partnerFirstUserAccount,
                    partnerAddress: partnerFirst,
                    partnerRegisterAddress: owner,
                });
            });

            beforeEach(async () => {
                // Initialise Casper epoch to current block number
                await casperEpochInitialise(owner);
            });


            // Attempt to make a withdrawal of rocket deposit tokens too early
            it(printTitle('userThird', 'fail to withdraw Rocket Deposit Tokens before pool begins staking'), async () => {

                // Try to withdraw tokens from that users' minipool
                await assertThrows(scenarioWithdrawDepositTokens({
                    miniPool: miniPools.second,
                    withdrawalAmount: 0,
                    fromAddress: userThird,
                    gas: 250000,
                }));

            });


            // Initialise nodes and checkin to launch minipools
            it(printTitle('---------', 'minipools are launched'), async() => {
                await launchMiniPools({
                    nodeFirst: nodeFirst,
                    nodeSecond: nodeSecond,
                    nodeRegisterAddress: owner,
                });               
            });


            // User cannot withdraw RPD from an unassociated minipool
            it(printTitle('user', 'cannot withdraw RPD from an unassociated minipool'), async () => {

                // Third user deposited the min required to launch a pool earlier, we need this amount so we can calculate 50%
                const userDeposit = await miniPools.second.getUserDeposit.call(userThird);
                const withdrawHalfAmount = parseInt(userDeposit.valueOf()) / 2;

                // Withdraw tokens from user's minipool
                await assertThrows(scenarioWithdrawDepositTokens({
                    miniPool: miniPools.first,
                    withdrawalAmount: withdrawHalfAmount,
                    fromAddress: userThird,
                    gas: 250000,
                }));

            });


            // User managed by a partner cannot withdraw RPD
            it(printTitle('managed user', 'cannot withdraw RPD'), async () => {

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get withdrawal amount
                const userDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                const withdrawHalfAmount = parseInt(userDeposit.valueOf()) / 2;

                // Withdraw tokens from user's minipool
                await assertThrows(scenarioWithdrawDepositTokens({
                    miniPool: userMiniPool,
                    withdrawalAmount: withdrawHalfAmount,
                    fromAddress: partnerFirstUserAccount,
                    gas: 250000,
                }));

            });


            // Random address cannot withdraw RPD as a user
            it(printTitle('random address', 'cannot withdraw RPD as a user'), async () => {

                // Third user deposited the min required to launch a pool earlier, we need this amount so we can calculate 50%
                const userDeposit = await miniPools.second.getUserDeposit.call(userThird);
                const withdrawHalfAmount = parseInt(userDeposit.valueOf()) / 2;

                // Withdraw tokens from user's minipool
                await assertThrows(scenarioWithdrawDepositTokens({
                    miniPool: miniPools.second,
                    withdrawalAmount: withdrawHalfAmount,
                    fromAddress: userSecond,
                    gas: 250000,
                }));

            });


            // User can withdraw deposit tokens while minipool is staking
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


        });


        /**
         * RPD transfers
         */
        describe('Transfers', async () => {


            // Contract dependencies
            let rocketDeposit;
            before(async () => {
                rocketDeposit = await RocketDepositToken.deployed();
            });

            beforeEach(async () => {
                // Initialise Casper epoch to current block number
                await casperEpochInitialise(owner);
            });


            // User can transfer deposit tokens to another user
            it(printTitle('userThird', 'transfers half of their deposit tokens to userFirst on the open market'), async () => {

                // Get token transfer amount
                const userThirdTokenBalance = await rocketDeposit.balanceOf.call(userThird);
                const tokenTransferAmount = parseInt(userThirdTokenBalance.valueOf()) / 2;
                
                // Transfer deposit tokens
                await scenarioTransferDepositTokens({
                    fromAddress: userThird,
                    toAddress: userFirst,
                    amount: tokenTransferAmount,
                    gas: 250000,
                });

            });


            // User cannot transfer more tokens than they own
            it(printTitle('userThird', 'fails to transfer more tokens than they own on the open market'), async () => {

                // Get invalid token transfer amount
                const userThirdTokenBalance = await rocketDeposit.balanceOf.call(userThird);
                const tokenTransferAmount = parseInt(userThirdTokenBalance.valueOf()) + 10000;

                // Transfer deposit tokens
                await scenarioTransferDepositTokens({
                    fromAddress: userThird,
                    toAddress: userFirst,
                    amount: tokenTransferAmount,
                    gas: 250000,
                    checkTransferred: false,
                });

                // Get user token balance
                const userThirdTokenBalanceAfter = await rocketDeposit.balanceOf.call(userThird);

                // Check that no tokens were sent
                assert.equal(userThirdTokenBalanceAfter.valueOf(), userThirdTokenBalance.valueOf(), 'Users tokens were transferred');

            });


            // User cannot transfer tokens from another address to their own
            it(printTitle('userThird', 'fails to transfer tokens from userFirst account to themselves on the open market'), async () => {

                // Get token transfer amount
                const userFirstTokenBalance = await rocketDeposit.balanceOf.call(userFirst);
                const tokenTransferAmount = parseInt(userFirstTokenBalance.valueOf()) / 2;

                // Transfer deposit tokens
                await scenarioTransferDepositTokensFrom({
                    fromAddress: userFirst,
                    toAddress: userThird,
                    amount: tokenTransferAmount,
                    gas: 250000,
                    checkTransferred: false,
                });

                // Get user token balance
                const userFirstTokenBalanceAfter = await rocketDeposit.balanceOf.call(userFirst);

                // Check that no tokens were sent
                assert.equal(userFirstTokenBalanceAfter.valueOf(), userFirstTokenBalance.valueOf(), 'Users tokens were transferred');

            });


            // First user can approve third user to transfer tokens from their account
            it(printTitle('userFirst', 'can approve userThird to transfer tokens from their account'), async () => {

                // Get token transfer amount
                const userFirstTokenBalance = await rocketDeposit.balanceOf.call(userFirst);
                const approvalAmount = parseInt(userFirstTokenBalance.valueOf()) / 2;

                // Approve transfer
                await scenarioApproveDepositTokenTransferFrom({
                    fromAddress: userFirst,
                    spenderAddress: userThird,
                    amount: approvalAmount,
                    gas: 250000,
                });

            });


            // Third user cannot transfer more than the approved amount from first user's account
            it(printTitle('userThird', 'cannot transfer more than the approved amount from userFirst\'s account'), async () => {

                // Get initial user token balance
                const userFirstTokenBalance = await rocketDeposit.balanceOf.call(userFirst);

                // Get token transfer allowance and amount
                const allowance = await rocketDeposit.allowance.call(userFirst, userThird);
                const tokenTransferAmount = parseInt(allowance.valueOf()) + parseInt(web3.toWei('0.1', 'ether').valueOf());

                // Transfer deposit tokens
                await scenarioTransferDepositTokensFrom({
                    fromAddress: userFirst,
                    toAddress: userThird,
                    amount: tokenTransferAmount,
                    gas: 250000,
                    checkTransferred: false,
                });

                // Get updated user token balance
                const userFirstTokenBalanceAfter = await rocketDeposit.balanceOf.call(userFirst);

                // Check that no tokens were sent
                assert.equal(userFirstTokenBalanceAfter.valueOf(), userFirstTokenBalance.valueOf(), 'Users tokens were transferred');

            });


            // Third user can transfer the approved amount from first user's account
            it(printTitle('userThird', 'can transfer the approved amount from userFirst\'s account'), async () => {

                // Get token transfer allowance and amount
                const allowance = await rocketDeposit.allowance.call(userFirst, userThird);
                const tokenTransferAmount = parseInt(allowance.valueOf());

                // Transfer deposit tokens
                await scenarioTransferDepositTokensFrom({
                    fromAddress: userFirst,
                    toAddress: userThird,
                    amount: tokenTransferAmount,
                    gas: 250000,
                });

            });


        });


        /**
         * RPD total withdrawals
         */
        describe('Total withdrawals', async () => {

            beforeEach(async () => {
                // Initialise Casper epoch to current block number
                await casperEpochInitialise(owner);
            });


            // User can withdraw all deposit tokens while minipool is staking
            it(printTitle('userThird', 'withdraws the remainder of their deposit as Rocket Deposit Tokens while their minipool is staking with Casper and are removed from pool'), async () => {

                // Withdraw all tokens from user's minipool
                await scenarioWithdrawDepositTokens({
                    miniPool: miniPools.second,
                    withdrawalAmount: 0,
                    fromAddress: userThird,
                    gas: 250000,
                });

                // Check that user is removed from pool as they don't have any deposit left
                await assertThrows(miniPools.second.getUserDeposit.call(userThird));

            });


        });


        /**
         * RPD burning
         */
        describe('Burning', async () => {        

            // Contract dependencies
            let rocketSettings;
            let rocketDeposit;
            let rocketPool;
            let rocketStorage;
            before(async () => {
                rocketSettings = await RocketSettings.deployed();
                rocketDeposit = await RocketDepositToken.deployed();
                rocketPool = await RocketPool.deployed();
                rocketStorage = await RocketStorage.deployed();
            });

            beforeEach(async () => {
                // Initialise Casper epoch to current block number
                await casperEpochInitialise(owner);
            });


            // User cannot burn deposit tokens for ether while there is not enough ether to cover the token amount
            it(printTitle('userThird', 'fails to trade their tokens for ether in the rocket deposit token fund as it does not have enough ether to cover the amount sent'), async () => {

                // Get amount of tokens to burn
                const userThirdTokenBalance = await rocketDeposit.balanceOf.call(userThird);
                const tokenBurnAmount = parseInt(userThirdTokenBalance.valueOf());

                // Burn tokens for ether
                await assertThrows(scenarioBurnDepositTokens({
                    burnAmount: tokenBurnAmount,
                    fromAddress: userThird,
                    gas: 250000,
                }));

            });


            // Log first and second minipools out from casper
            it(printTitle('---------', 'first and second minipools logged out from Casper'), async () => {
                await rocketPool.setPoolStakingDuration(miniPools.first.address, 0, {from: owner, gas: 150000});
                await rocketPool.setPoolStakingDuration(miniPools.second.address, 0, {from: owner, gas: 150000});

                await casperEpochIncrementAmount(owner, 2);

                await scenarioNodeLogoutForWithdrawal({
                    owner: owner,
                    validators: [
                        {nodeAddress: nodeFirst, minipoolAddress: miniPools.first.address},
                        {nodeAddress: nodeSecond, minipoolAddress: miniPools.second.address}
                    ],
                    nodeAddress: nodeFirst,
                    minipoolAddress: miniPools.first.address,
                    gas: nodeLogoutGas
                });

                // Check attached minipool has withdrawn deposit from casper
                let firstMiniPoolStatus = await miniPools.first.getStatus.call();
                assert.equal(firstMiniPoolStatus.valueOf(), 4, 'Invalid attached first minipool status');
                let firstMiniPoolBalance = web3.eth.getBalance(miniPools.first.address);            
                assert.isTrue(firstMiniPoolBalance.valueOf() > 0, 'Invalid attached first minipool balance');

                await casperEpochIncrementAmount(owner, 1);

                await scenarioNodeLogoutForWithdrawal({
                    owner: owner,
                    validators: [
                        {nodeAddress: nodeSecond, minipoolAddress: miniPools.second.address}
                    ],
                    nodeAddress: nodeSecond,
                    minipoolAddress: miniPools.second.address,
                    gas: nodeLogoutGas
                });            

                // Second minipool should be closed and have no balance.                
                let secondMiniPoolBalance = web3.eth.getBalance(miniPools.second.address);            
                assert.isTrue(secondMiniPoolBalance.valueOf() == 0, 'Invalid attached second minipool balance');
            });


            // Check test conditions
            it(printTitle('---------', 'all of userThirds withdrawn token backed ethers should be in the deposit token fund now'), async () => {

                // Get the min ether required to launch a minipool - the user sent half this amount for tokens originally
                const etherAmountTradedSentForTokens = await rocketSettings.getMiniPoolLaunchAmount.call();
                const depositTokenFundBalance = web3.eth.getBalance(rocketDeposit.address); 

                // Check that withdrawn token backed ether is in the deposit token fund
                assert.equal(depositTokenFundBalance.valueOf(), etherAmountTradedSentForTokens.valueOf(), 'Deposit token fund balance does not match');

            });


            // User cannot burn tokens they don't own for ether
            it(printTitle('user', 'cannot burn tokens they don\'t own for ether'), async () => {

                // Get amount of tokens to burn
                const userFirstTokenBalance = await rocketDeposit.balanceOf.call(userFirst);
                const tokenBurnAmount = parseInt(userFirstTokenBalance.valueOf());

                // Burn deposit tokens for ether
                await assertThrows(scenarioBurnDepositTokens({
                    burnAmount: tokenBurnAmount,
                    fromAddress: userSecond,
                    gas: 250000,
                }));

            });


            // User can burn deposit tokens for ether plus bonus when there is enough ether to cover the amount
            it(printTitle('userFirst', 'burns their deposit tokens received from userThird in return for ether + bonus'), async () => {

                // Get amount of tokens to burn
                const userFirstTokenBalance = await rocketDeposit.balanceOf.call(userFirst);
                const tokenBurnAmount = parseInt(userFirstTokenBalance.valueOf());

                // Burn deposit tokens for ether
                await scenarioBurnDepositTokens({
                    burnAmount: tokenBurnAmount,
                    fromAddress: userFirst,
                    gas: 250000,
                });

            });


        });


    });

}
