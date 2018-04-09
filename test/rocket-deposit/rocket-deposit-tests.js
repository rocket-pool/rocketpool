import { printTitle, assertThrows } from '../utils';
import { RocketDepositToken, RocketSettings, RocketPool } from '../artifacts';
import { scenarioDeposit } from '../rocket-user/rocket-user-scenarios';
import { scenarioIncrementEpoch, scenarioIncrementDynasty, scenarioCreateValidationContract } from '../casper/casper-scenarios';
import { scenarioRegisterNode, scenarioNodeCheckin } from '../rocket-node/rocket-node-scenarios';
import { scenarioWithdrawDepositTokens, scenarioBurnDepositTokens, scenarioTransferDepositTokens, scenarioTransferDepositTokensFrom } from './rocket-deposit-scenarios';

export default function({owner}) {

    contract('RocketDeposit', async (accounts) => {


        /**
         * Config
         */

        // User addresses
        const userFirst = accounts[1];
        const userThird = accounts[3];

        // Node addresses
        const nodeFirst = accounts[8];
        const nodeSecond = accounts[9];

        // Minipools
        let miniPools = {};


        // Contract dependencies
        let rocketSettings;
        let rocketDeposit;
        before(async () => {
            rocketSettings = await RocketSettings.deployed();
            rocketDeposit = await RocketDepositToken.deployed();
        });


        /**
         * RPD withdrawals
         */
        describe('Withdrawals', async () => {


            // Contract dependencies
            let rocketSettings;
            before(async () => {
                rocketSettings = await RocketSettings.deployed();
            });


            // Initialise minipools
            before(async () => {

                // Get the amount of ether to deposit - enough to launch a minipool
                const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = parseInt(minEtherRequired.valueOf());

                // Deposit ether to create first minipool
                let miniPool1 = await scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userFirst,
                    depositAmount: sendAmount,
                    gas: 4800000,
                });

                // Deposit ether to create first minipool
                let miniPool2 = await scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userThird,
                    depositAmount: sendAmount,
                    gas: 4800000,
                });

                // Set minipools
                miniPools.first = miniPool1;
                miniPools.second = miniPool2;

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

                // Register nodes
                let nodeFirstValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeFirst});
                let nodeSecondValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeSecond});
                await scenarioRegisterNode({
                    nodeAddress: nodeFirst,
                    valCodeAddress: nodeFirstValCodeAddress,
                    providerID: 'aws',
                    subnetID: 'nvirginia',
                    instanceID: 'i-1234567890abcdef5',
                    regionID: 'usa-east',
                    fromAddress: owner,
                    gas: 1600000
                });
                await scenarioRegisterNode({
                    nodeAddress: nodeSecond,
                    valCodeAddress: nodeSecondValCodeAddress,
                    providerID: 'rackspace',
                    subnetID: 'ohio',
                    instanceID: '4325',
                    regionID: 'usa-east',
                    fromAddress: owner,
                    gas: 1600000
                });

                // Set minipool countdown time
                await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

                // Perform checkins
                await scenarioNodeCheckin({
                    averageLoad: web3.toWei('0.5', 'ether'),
                    fromAddress: nodeFirst,
                });
                await scenarioNodeCheckin({
                    averageLoad: web3.toWei('0.5', 'ether'),
                    fromAddress: nodeSecond,
                });

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

        });


        /**
         * RPD total withdrawals
         */
        describe('Total withdrawals', async () => {


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


            // Log first and second minipools out from casper
            before(async () => {
                const rocketPool = await RocketPool.deployed();

                // Set minipool staking durations
                await rocketPool.setPoolStakingDuration(miniPools.first.address, 0, {from: owner, gas: 150000});
                await rocketPool.setPoolStakingDuration(miniPools.second.address, 0, {from: owner, gas: 150000});

                // Perform checkins
                await scenarioNodeCheckin({
                    averageLoad: web3.toWei('0.5', 'ether'),
                    fromAddress: nodeFirst,
                });
                await scenarioNodeCheckin({
                    averageLoad: web3.toWei('0.5', 'ether'),
                    fromAddress: nodeSecond,
                });

                // Step casper forward
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementEpoch(owner);

                // Perform checkins
                await scenarioNodeCheckin({
                    averageLoad: web3.toWei('0.5', 'ether'),
                    fromAddress: nodeFirst,
                });
                await scenarioNodeCheckin({
                    averageLoad: web3.toWei('0.5', 'ether'),
                    fromAddress: nodeSecond,
                });

            });


            // Check test conditions
            it(printTitle('---------', 'all of userThirds withdrawn token backed ethers should be in the deposit token fund now'), async () => {

                // Get the min ether required to launch a minipool - the user sent half this amount for tokens originally
                const etherAmountTradedSentForTokens = await rocketSettings.getMiniPoolLaunchAmount.call();
                const depositTokenFundBalance = web3.eth.getBalance(rocketDeposit.address);

                // Check that withdrawn token backed ether is in the deposit token fund
                assert.equal(depositTokenFundBalance.valueOf(), etherAmountTradedSentForTokens.valueOf(), 'Deposit token fund balance does not match');

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
