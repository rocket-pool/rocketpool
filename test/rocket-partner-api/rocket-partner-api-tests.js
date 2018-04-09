import { printTitle, assertThrows } from '../utils';
import { RocketSettings, RocketPool, RocketPoolMini } from '../artifacts';
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


        });


        /**
         * Partner deposits
         */
        describe('Deposits', async () => {


            // Contract dependencies
            let rocketSettings;
            before(async () => {
                rocketSettings = await RocketSettings.deployed();
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


        });


        /**
         * Partner withdrawals
         */
        describe('Withdrawals', async () => {


            // Contract dependencies
            let rocketPool;
            before(async () => {
                rocketPool = await RocketPool.deployed();
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


            // Owner removes first partner - users attached to this partner can still withdraw
            it(printTitle('owner', 'removes first partner from the Rocket Pool network'), async () => {
                await scenarioRemovePartner({
                    partnerAddress: partnerFirst,
                    newerPartnerAddress: partnerSecond,
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
