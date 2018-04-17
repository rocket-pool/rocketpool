import { printTitle, assertThrows } from '../utils';
import { RocketPartnerAPI, RocketSettings, RocketPool, RocketPoolMini } from '../artifacts';
import { launchMiniPools } from '../rocket-node/rocket-node-utils';
import { scenarioRegisterPartner, scenarioPartnerDeposit, scenarioPartnerWithdraw, scenarioRemovePartner } from './rocket-partner-api-scenarios';

export default function({owner}) {

    contract('RocketPartnerAPI', async (accounts) => {


        /**
         * Config
         */

        // Partner addresses
        const partnerFirst = accounts[5];
        const partnerSecond = accounts[7];

        // User addresses
        const userFirst = accounts[1];
        const userSecond = accounts[2];
        const userThird = accounts[3];
        const partnerFirstUserAccount = accounts[6];
        const partnerSecondUserAccount = accounts[8];

        // Partner details
        const partnerFirstName = 'Coinbase';
        const partnerSecondName = 'MEW';

        // Gas costs
        const partnerRegisterGas = 200000;
        const rocketDepositGas = 4800000;
        const rocketWithdrawalGas = 1450000;


        /**
         * Partner registration
         */
        describe('Registration', async () => {


            // Try to register a new partner as a non rocket pool owner
            it(printTitle('non owner', 'fail to register a partner'), async () => {
                await assertThrows(scenarioRegisterPartner({
                    partnerAddress: partnerFirst,
                    partnerName: partnerFirstName,
                    fromAddress: userFirst,
                    gas: partnerRegisterGas
                }));
            });


            // Register two 3rd party partners
            it(printTitle('owner', 'register 2 partners'), async () => {

                // Register first partner
                await scenarioRegisterPartner({
                    partnerAddress: partnerFirst,
                    partnerName: partnerFirstName,
                    fromAddress: owner,
                    gas: partnerRegisterGas
                });

                // Register second partner
                await scenarioRegisterPartner({
                    partnerAddress: partnerSecond,
                    partnerName: partnerSecondName,
                    fromAddress: owner,
                    gas: partnerRegisterGas
                });

            });


            // Owner cannot register a partner with an invalid (null) address
            it(printTitle('owner', 'cannot register a partner with an invalid address'), async () => {
                await assertThrows(scenarioRegisterPartner({
                    partnerAddress: '0x0000000000000000000000000000000000000000',
                    partnerName: 'Failing',
                    fromAddress: owner,
                    gas: partnerRegisterGas
                }));
            });


            // Owner cannot register a partner with an address that has already been used
            it(printTitle('owner', 'cannot register a partner with an address that already exists'), async () => {
                await assertThrows(scenarioRegisterPartner({
                    partnerAddress: partnerFirst,
                    partnerName: partnerFirstName,
                    fromAddress: owner,
                    gas: partnerRegisterGas
                }));
            });


        });


        /**
         * Partner deposits
         */
        describe('Deposits', async () => {


            // Contract dependencies
            let rocketSettings;
            let rocketPartnerAPI;
            before(async () => {
                rocketSettings = await RocketSettings.deployed();
                rocketPartnerAPI = await RocketPartnerAPI.deployed();
            });


            // Attempt to make a deposit with an incorrect pool staking time ID
            it(printTitle('partnerFirst', 'fail to deposit with an incorrect pool staking time ID'), async () => {

                // Calculate just enough ether to create a minipool
                const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

                // Deposit on behalf of the partner with an invalid pool staking time ID
                await assertThrows(scenarioPartnerDeposit({
                    userAddress: partnerFirstUserAccount,
                    stakingTimeID: 'beer',
                    fromAddress: partnerFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

            });


            // Attempt to make a deposit with an unregistered 3rd party partner
            it(printTitle('userThird', 'fail to deposit with an unregistered partner'), async () => {
                
                // Calculate just enough ether to create a minipool
                const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

                // Deposit on behalf of an unregistered partner
                await assertThrows(scenarioPartnerDeposit({
                    userAddress: userThird,
                    stakingTimeID: 'short',
                    fromAddress: userSecond,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

            });


            // Another user (partner user) sends a deposit and has a new pool accepting deposits created for them as the previous one is now in countdown to launch mode and not accepting deposits
            it(printTitle('partnerFirst', 'send ether to RP on behalf of their user, second minipool is created for them and is accepting deposits'), async () => {

                // Calculate just enough ether to create a minipool
                const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

                // Deposit on behalf of of partner
                await scenarioPartnerDeposit({
                    userAddress: partnerFirstUserAccount,
                    stakingTimeID: 'short',
                    fromAddress: partnerFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                });

            });


            // Partner cannot deposit an amount less than the minimum user deposit
            it(printTitle('partner', 'cannot deposit an amount less than the minimum user deposit'), async () => {

                // Get minimum user deposit & send amount
                let minDepositAmount = await rocketSettings.getUserDepositMin();
                let sendAmount = parseInt(minDepositAmount.valueOf()) - parseInt(web3.toWei('0.5', 'ether').valueOf());

                // Deposit
                await assertThrows(scenarioPartnerDeposit({
                    userAddress: partnerFirstUserAccount,
                    stakingTimeID: 'short',
                    fromAddress: partnerFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

            });


            // Partner cannot deposit an amount greater than the maximum user deposit
            it(printTitle('partner', 'cannot deposit an amount greater than the maximum user deposit'), async () => {

                // Get maximum user deposit & send amount
                let maxDepositAmount = await rocketSettings.getUserDepositMax();
                let sendAmount = parseInt(maxDepositAmount.valueOf()) + parseInt(web3.toWei('0.5', 'ether').valueOf());

                // Deposit
                await assertThrows(scenarioPartnerDeposit({
                    userAddress: partnerFirstUserAccount,
                    stakingTimeID: 'short',
                    fromAddress: partnerFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

            });


            // Partner cannot deposit while user deposits are disabled
            it(printTitle('partner', 'cannot deposit while user deposits are disabled'), async () => {

                // Disable user deposits
                await rocketSettings.setUserDepositAllowed(false);

                // Calculate just enough ether to create a minipool
                const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

                // Deposit
                await assertThrows(scenarioPartnerDeposit({
                    userAddress: partnerFirstUserAccount,
                    stakingTimeID: 'short',
                    fromAddress: partnerFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

                // Enable user deposits
                await rocketSettings.setUserDepositAllowed(true);

            });


            // Partner cannot deposit while partner deposits are disabled
            it(printTitle('partner', 'cannot deposit while partner deposits are disabled'), async () => {

                // Disable partner deposits
                await rocketPartnerAPI.setPartnerDepositsEnabled(partnerSecond, false);

                // Calculate just enough ether to create a minipool
                const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

                // Deposit
                await assertThrows(scenarioPartnerDeposit({
                    userAddress: partnerSecondUserAccount,
                    stakingTimeID: 'short',
                    fromAddress: partnerSecond,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

            });


            // Partner can deposit after partner deposits are renabled
            it(printTitle('partner', 'can deposit after partner deposits are renabled'), async () => {

                // Disable partner deposits
                await rocketPartnerAPI.setPartnerDepositsEnabled(partnerSecond, true);

                // Calculate just enough ether to create a minipool
                const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

                // Deposit
                await scenarioPartnerDeposit({
                    userAddress: partnerFirstUserAccount,
                    stakingTimeID: 'short',
                    fromAddress: partnerSecond,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                });

            });



        });


        /**
         * Partner withdrawals
         */
        describe('Withdrawals', async () => {


            // Contract dependencies
            let rocketPool;
            let rocketSettings;
            let rocketPartnerAPI;
            before(async () => {
                rocketPool = await RocketPool.deployed();
                rocketSettings = await RocketSettings.deployed();
                rocketPartnerAPI = await RocketPartnerAPI.deployed();
            });


            // First partner withdraws half their users previous Ether from the pool before it has launched for staking
            it(printTitle('partnerFirst', 'withdraws half their users previous deposit from the minipool'), async () => {

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Withdraw on behalf of partner
                await scenarioPartnerWithdraw({
                    miniPool: userMiniPool,
                    withdrawalAmount: withdrawalAmount,
                    userAddress: partnerFirstUserAccount,
                    fromAddress: partnerFirst,
                    gas: rocketWithdrawalGas,
                });

            });


            // First partner user withdraws the remaining deposit from the minipool, their user is removed from it and the minipool is destroyed as it has no users anymore
            it(printTitle('partnerFirst', 'withdraws their users remaining deposit from the minipool, their user is removed from it and the minipool is destroyed as it has no users anymore'), async () => {

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get amount to withdraw - entire deposit
                let userMiniPoolDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf());

                // Withdraw on behalf of partner
                await scenarioPartnerWithdraw({
                    miniPool: userMiniPool,
                    withdrawalAmount: withdrawalAmount,
                    userAddress: partnerFirstUserAccount,
                    fromAddress: partnerFirst,
                    gas: rocketWithdrawalGas,
                });

            });


            // New deposit is made by first partner
            it(printTitle('---------', 'new deposit made by first partner'), async () => {

                // Calculate just enough ether to create a minipool
                const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

                // Deposit on behalf of partner
                await scenarioPartnerDeposit({
                    userAddress: partnerFirstUserAccount,
                    stakingTimeID: 'short',
                    fromAddress: partnerFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                });

            });


            // Partner cannot withdraw an amount less than the minimum user withdrawal
            it(printTitle('partner', 'cannot withdraw an amount less than the minimum user withdrawal'), async () => {

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Set minimum user withdrawal above withdrawal amount
                await rocketSettings.setUserWithdrawalMin(withdrawalAmount + parseInt(web3.toWei('1', 'ether')));

                // Withdraw on behalf of partner
                await assertThrows(scenarioPartnerWithdraw({
                    miniPool: userMiniPool,
                    withdrawalAmount: withdrawalAmount,
                    userAddress: partnerFirstUserAccount,
                    fromAddress: partnerFirst,
                    gas: rocketWithdrawalGas,
                }));

                // Reset minimum user withdrawal
                await rocketSettings.setUserWithdrawalMin(0);

            });


            // Partner cannot withdraw an amount greater than the maximum user withdrawal
            it(printTitle('partner', 'cannot withdraw an amount greater than the maximum user withdrawal'), async () => {

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Set maximum user withdrawal below withdrawal amount
                await rocketSettings.setUserWithdrawalMax(withdrawalAmount - parseInt(web3.toWei('1', 'ether')));

                // Withdraw on behalf of partner
                await assertThrows(scenarioPartnerWithdraw({
                    miniPool: userMiniPool,
                    withdrawalAmount: withdrawalAmount,
                    userAddress: partnerFirstUserAccount,
                    fromAddress: partnerFirst,
                    gas: rocketWithdrawalGas,
                }));

                // Reset maximum user withdrawal
                await rocketSettings.setUserWithdrawalMax(web3.toWei('75', 'ether'));

            });


            // Partner cannot withdraw on behalf of an unassociated user
            it(printTitle('partner', 'cannot withdraw on behalf of an unassociated user'), async () => {

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Withdraw on behalf of partner
                await assertThrows(scenarioPartnerWithdraw({
                    miniPool: userMiniPool,
                    withdrawalAmount: withdrawalAmount,
                    userAddress: partnerFirstUserAccount,
                    fromAddress: partnerSecond,
                    gas: rocketWithdrawalGas,
                }));

            });


            // Partner cannot withdraw from an invalid minipool
            it(printTitle('partner', 'cannot withdraw from an invalid minipool'), async () => {

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Withdraw on behalf of partner
                await assertThrows(scenarioPartnerWithdraw({
                    miniPool: RocketPoolMini.at(partnerFirstUserAccount),
                    withdrawalAmount: withdrawalAmount,
                    userAddress: partnerFirstUserAccount,
                    fromAddress: partnerFirst,
                    gas: rocketWithdrawalGas,
                }));

            });


            // Random address cannot withdraw as a partner
            it(printTitle('random address', 'cannot withdraw as a partner'), async () => {

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Withdraw on behalf of partner
                await assertThrows(scenarioPartnerWithdraw({
                    miniPool: userMiniPool,
                    withdrawalAmount: withdrawalAmount,
                    userAddress: partnerFirstUserAccount,
                    fromAddress: userFirst,
                    gas: rocketWithdrawalGas,
                }));

            });


            // Partner cannot withdraw while user withdrawals are disabled
            it(printTitle('partner', 'cannot withdraw while user withdrawals are disabled'), async () => {

                // Disable user withdrawals
                await rocketSettings.setUserWithdrawalAllowed(false);

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Withdraw on behalf of partner
                await assertThrows(scenarioPartnerWithdraw({
                    miniPool: userMiniPool,
                    withdrawalAmount: withdrawalAmount,
                    userAddress: partnerFirstUserAccount,
                    fromAddress: partnerFirst,
                    gas: rocketWithdrawalGas,
                }));

                // Enable user withdrawals
                await rocketSettings.setUserWithdrawalAllowed(true);

            });


            // Partner cannot withdraw while partner withdrawals are disabled
            it(printTitle('partner', 'cannot withdraw while partner withdrawals are disabled'), async () => {

                // Disable partner withdrawals
                await rocketPartnerAPI.setPartnerWithdrawalsEnabled(partnerFirst, false);

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Withdraw on behalf of partner
                await assertThrows(scenarioPartnerWithdraw({
                    miniPool: userMiniPool,
                    withdrawalAmount: withdrawalAmount,
                    userAddress: partnerFirstUserAccount,
                    fromAddress: partnerFirst,
                    gas: rocketWithdrawalGas,
                }));

                // TODO: re-enable partner withdrawals if possible?

            });


            // Minipools are launched
            it(printTitle('---------', 'minipools launched'), async () => {

                // Calculate enough ether to launch the minipool
                const sendAmount = parseInt(web3.toWei('2', 'ether').valueOf());

                // Deposit
                await scenarioPartnerDeposit({
                    userAddress: partnerFirstUserAccount,
                    stakingTimeID: 'short',
                    fromAddress: partnerFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                });

                // Launch minipools
                await launchMiniPools({
                    nodeFirst: accounts[4],
                    nodeSecond: accounts[9],
                    nodeRegisterAddress: owner,
                });

            });


            // Partner cannot withdraw while minipool is staking or logged out
            it(printTitle('partner', 'cannot withdraw while minipool is staking or logged out'), async () => {

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await userMiniPool.getUserDeposit.call(partnerFirstUserAccount);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Withdraw on behalf of partner
                await assertThrows(scenarioPartnerWithdraw({
                    miniPool: userMiniPool,
                    withdrawalAmount: withdrawalAmount,
                    userAddress: partnerFirstUserAccount,
                    fromAddress: partnerFirst,
                    gas: rocketWithdrawalGas,
                }));

            });


        });


        /**
         * Partner removal
         */
        describe('Removal', async () => {


            // Contract dependencies
            let rocketSettings;
            before(async () => {
                rocketSettings = await RocketSettings.deployed();
            });


            // Owner cannot remove a nonexistent partner
            it(printTitle('owner', 'cannot remove a nonexistent partner'), async () => {
                await assertThrows(scenarioRemovePartner({
                    partnerAddress: userFirst,
                    fromAddress: owner,
                    gas: 500000,
                }));
            });


            // Random address cannot remove a partner
            it(printTitle('random address', 'cannot remove a partner'), async () => {
                await assertThrows(scenarioRemovePartner({
                    partnerAddress: partnerFirst,
                    fromAddress: userFirst,
                    gas: 500000,
                }));
            });


            // Owner removes first partner - users attached to this partner can still withdraw
            it(printTitle('owner', 'removes first partner from the Rocket Pool network'), async () => {
                await scenarioRemovePartner({
                    partnerAddress: partnerFirst,
                    fromAddress: owner,
                    gas: 500000,
                });
            });


            // Attempt to make a deposit after being removed as a partner
            it(printTitle('partnerFirst', 'attempt to make a deposit after being removed as a partner'), async () => {

                // Calculate just enough ether to create a minipool
                const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

                // Attempt deposit
                await assertThrows(scenarioPartnerDeposit({
                    userAddress: partnerFirstUserAccount,
                    stakingTimeID: 'short',
                    fromAddress: partnerFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

            });


        });


    });

}
