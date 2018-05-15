import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketSettings, RocketPool, RocketPoolMini } from '../_lib/artifacts'
import { launchMiniPools, logoutMiniPools } from '../rocket-node/rocket-node-utils';
import { scenarioNodeLogoutForWithdrawal } from '../rocket-node/rocket-node-validator/rocket-node-validator-scenarios';
import { initialisePartnerUser } from '../rocket-partner-api/rocket-partner-api-utils';
import { scenarioDeposit, scenarioRegisterWithdrawalAddress, scenarioWithdrawDeposit } from './rocket-user-scenarios';

export default function({owner}) {

    const nodeLogoutGas = 1600000;

    contract('RocketUser', async (accounts) => {


        /**
         * Config
         */

        // User addresses
        const userFirst = accounts[1];
        const userSecond = accounts[2];
        const userThird = accounts[3];
        const userFirstBackupAddress = accounts[5];
        const userSecondBackupAddress = accounts[4];
        const partnerFirstUserAccount = accounts[6];

        // Partner addresses
        const partnerFirst = accounts[7];

        // Node addresses
        const nodeFirst = accounts[8];
        const nodeSecond = accounts[9];

        // Gas costs
        const rocketDepositGas = 4800000;
        const rocketWithdrawalGas = 1450000;

        // Minipools
        let miniPools = {};


        /**
         * User deposits
         */
        describe('Deposits', async () => {


            // Contract dependencies
            let rocketSettings;
            before(async () => {
                rocketSettings = await RocketSettings.deployed();
            });


            // Send ether to Rocket pool with just less than the min amount required to launch a minipool with no specified 3rd party user partner
            it(printTitle('userFirst', 'sends ether to RP, create first minipool, registers user with pool'), async () => {

                // Get the amount of ether to send - enough to create a minipool but not launch it
                const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = parseInt(minEtherRequired.valueOf()) - parseInt(web3.toWei('2', 'ether'));

                // Deposit ether
                let miniPool = await scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                });

                // Set first minipool
                miniPools.first = miniPool;

            });


            // Have the same initial user send an deposit again, to trigger the pool to go into countdown
            it(printTitle('userFirst', 'sends ether to RP again, their balance updates, first minipool remains accepting deposits and only 1 reg user'), async () => {

                // Get the amount of ether to send - still not enough to launch the minipool
                const sendAmount = parseInt(web3.toWei('1', 'ether').valueOf());

                // Deposit ether
                await scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                });

            });


            // Have a new user send an deposit, to trigger the pool to go into countdown
            it(printTitle('userSecond', 'sends ether to RP, first minipool status changes to countdown and only 2 reg users'), async () => {

                // Get the amount of ether to send - enough to launch the minipool
                let sendAmount = parseInt(web3.toWei('5', 'ether').valueOf());

                // Deposit ether
                await scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userSecond,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                });

            });


            // Have a new user send a deposit to create a second minipool and trigger it to go into countdown
            it(printTitle('userThird', 'sends a lot of ether to RP, creates second minipool, registers user with pool and sets status of minipool to countdown'), async () => {

                // Get the amount of ether to send - enough to launch a minipool
                const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = parseInt(minEtherRequired.valueOf());

                // Deposit ether
                let miniPool = await scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userThird,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                });

                // Set second minipool
                miniPools.second = miniPool;

            });


            // User cannot deposit with an invalid staking time iD
            it(printTitle('user', 'cannot deposit with an invalid staking time ID'), async() => {

                // Get the amount of ether to send
                let sendAmount = parseInt(web3.toWei('1', 'ether').valueOf());

                // Deposit ether
                await assertThrows(scenarioDeposit({
                    stakingTimeID: 'beer',
                    fromAddress: userFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

            });


            // User cannot deposit while user deposits are disabled
            it(printTitle('user', 'cannot deposit while user deposits are disabled'), async() => {

                // Disable user deposits
                await rocketSettings.setUserDepositAllowed(false);

                // Get the amount of ether to send
                let sendAmount = parseInt(web3.toWei('1', 'ether').valueOf());

                // Deposit ether
                await assertThrows(scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

                // Enable user deposits
                await rocketSettings.setUserDepositAllowed(true);

            });


            // User cannot deposit an amount less than the minimum user deposit
            it(printTitle('user', 'cannot deposit an amount less than the minimum user deposit'), async () => {

                // Get minimum user deposit & send amount
                let minDepositAmount = await rocketSettings.getUserDepositMin();
                let sendAmount = parseInt(minDepositAmount.valueOf()) - parseInt(web3.toWei('0.5', 'ether').valueOf());

                // Deposit ether
                await assertThrows(scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

            });


            // User cannot deposit an amount greater than the maximum user deposit
            it(printTitle('user', 'cannot deposit an amount greater than the maximum user deposit'), async () => {

                // Get maximum user deposit & send amount
                let maxDepositAmount = await rocketSettings.getUserDepositMax();
                let sendAmount = parseInt(maxDepositAmount.valueOf()) + parseInt(web3.toWei('0.5', 'ether').valueOf());

                // Deposit ether
                await assertThrows(scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userFirst,
                    depositAmount: sendAmount,
                    gas: rocketDepositGas,
                }));

            });


        });


        /**
         * User backup withdrawal addresses
         */
        describe('Withdrawal Address', async () => {


            // Contract dependencies
            let rocketPool;
            before(async () => {
                rocketPool = await RocketPool.deployed();
            });


            // Initialise user managed by partner
            before(async () => {
                await initialisePartnerUser({
                    userAddress: partnerFirstUserAccount,
                    partnerAddress: partnerFirst,
                    partnerRegisterAddress: owner,
                });
            });


            // Second user sets a backup withdrawal address
            it(printTitle('userSecond', 'registers a backup withdrawal address on their deposit while minipool is in countdown'), async () => {
                await scenarioRegisterWithdrawalAddress({
                    withdrawalAddress: userSecondBackupAddress,
                    miniPool: miniPools.first,
                    fromAddress: userSecond,
                    gas: 550000,
                });
            });


            // User cannot set a backup withdrawal address to an invalid address
            it(printTitle('user', 'cannot set a backup withdrawal address to an invalid address'), async () => {

                // Register withdrawal address
                let result = await scenarioRegisterWithdrawalAddress({
                    withdrawalAddress: '0x0000000000000000000000000000000000000000',
                    miniPool: miniPools.first,
                    fromAddress: userFirst,
                    gas: 550000,
                    checkLogs: false,
                });

                // Assert UserSetBackupWithdrawalAddress event was not logged
                let log = result.logs.find(({ event }) => event == 'UserSetBackupWithdrawalAddress');
                assert.equal(log, undefined, 'UserSetBackupWithdrawalAddress event was logged');

            });


            // User cannot set a backup withdrawal address to the user's partner's address
            it(printTitle('user', 'cannot set a backup withdrawal address to the user\'s partner\'s address'), async () => {

                // Get user's latest minipool
                let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount);
                let userMiniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);

                // Register withdrawal address
                let result = await scenarioRegisterWithdrawalAddress({
                    withdrawalAddress: partnerFirst,
                    miniPool: userMiniPool,
                    fromAddress: partnerFirstUserAccount,
                    gas: 550000,
                    checkLogs: false,
                });

                // Assert UserSetBackupWithdrawalAddress event was not logged
                let log = result.logs.find(({ event }) => event == 'UserSetBackupWithdrawalAddress');
                assert.equal(log, undefined, 'UserSetBackupWithdrawalAddress event was logged');

            });


            // User cannot set a backup withdrawal address for an unassociated minipool
            it(printTitle('user', 'cannot set a backup withdrawal address for an unassociated minipool'), async () => {
                await assertThrows(scenarioRegisterWithdrawalAddress({
                    withdrawalAddress: userFirstBackupAddress,
                    miniPool: miniPools.second,
                    fromAddress: userFirst,
                    gas: 550000,
                }));
            });


            // Minipools are launched
            it(printTitle('---------', 'minipools launched'), async () => {
                await launchMiniPools({
                    nodeFirst: nodeFirst,
                    nodeSecond: nodeSecond,
                    nodeRegisterAddress: owner,
                });
            });


            // User cannot set a backup withdrawal address after minipool has launched
            it(printTitle('user', 'cannot set a backup withdrawal address after minipool has launched'), async () => {

                // Register withdrawal address
                let result = await scenarioRegisterWithdrawalAddress({
                    withdrawalAddress: userFirstBackupAddress,
                    miniPool: miniPools.first,
                    fromAddress: userFirst,
                    gas: 550000,
                    checkLogs: false,
                });

                // Assert UserSetBackupWithdrawalAddress event was not logged
                let log = result.logs.find(({ event }) => event == 'UserSetBackupWithdrawalAddress');
                assert.equal(log, undefined, 'UserSetBackupWithdrawalAddress event was logged');

            });


        });


        /**
         * User withdrawals
         */
        describe('Withdrawals', async () => {


            // Contract dependencies
            let rocketSettings;
            let rocketPool;
            before(async () => {
                rocketSettings = await RocketSettings.deployed();
                rocketPool = await RocketPool.deployed();
            });


            // First user with deposit staking in minipool attempts to withdraw deposit before staking has finished
            it(printTitle('userFirst', 'user fails to withdraw deposit while minipool is staking'), async () => {
                await assertThrows(scenarioWithdrawDeposit({
                    miniPool: miniPools.first,
                    withdrawalAmount: 0,
                    fromAddress: userFirst,
                    feeAccountAddress: owner,
                    gas: rocketWithdrawalGas,
                }));
            });


            // First and second minipools logged out from Casper
            it(printTitle('---------', 'first and second minipools logged out from Casper'), async () => {
                await rocketPool.setPoolStakingDuration(miniPools.first.address, 0, {from: owner, gas: 150000});
                await rocketPool.setPoolStakingDuration(miniPools.second.address, 0, {from: owner, gas: 150000});

                let logoutMessage = '0x8779787998798798';

                await scenarioNodeLogoutForWithdrawal({
                    owner: owner,
                    nodeAddress: nodeFirst,
                    minipoolAddress: miniPools.first.address,
                    logoutMessage: logoutMessage,
                    gas: nodeLogoutGas
                });

                await scenarioNodeLogoutForWithdrawal({
                    owner: owner,
                    nodeAddress: nodeSecond,
                    minipoolAddress: miniPools.second.address,
                    logoutMessage: logoutMessage,
                    gas: nodeLogoutGas
                });
            });


            // User cannot withdraw while user withdrawals are disabled
            it(printTitle('user', 'cannot withdraw while user withdrawals are disabled'), async () => {

                // Disable user withdrawals
                await rocketSettings.setUserWithdrawalAllowed(false);

                // Withdraw deposit
                await assertThrows(scenarioWithdrawDeposit({
                    miniPool: miniPools.first,
                    withdrawalAmount: 0,
                    fromAddress: userFirst,
                    feeAccountAddress: owner,
                    gas: rocketWithdrawalGas,
                }));

                // Enable user withdrawals
                await rocketSettings.setUserWithdrawalAllowed(true);

            });


            // User cannot withdraw an amount less than the minimum user withdrawal
            it(printTitle('user', 'cannot withdraw an amount less than the minimum user withdrawal'), async () => {

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await miniPools.first.getUserDeposit.call(userFirst);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Set minimum user withdrawal above withdrawal amount
                await rocketSettings.setUserWithdrawalMin(withdrawalAmount + parseInt(web3.toWei('1', 'ether')));

                // Withdraw deposit
                await assertThrows(scenarioWithdrawDeposit({
                    miniPool: miniPools.first,
                    withdrawalAmount: withdrawalAmount,
                    fromAddress: userFirst,
                    feeAccountAddress: owner,
                    gas: rocketWithdrawalGas,
                }));

                // Reset minimum user withdrawal
                await rocketSettings.setUserWithdrawalMin(0);

            });


            // User cannot withdraw an amount greater than the maximum user withdrawal
            it(printTitle('user', 'cannot withdraw an amount greater than the maximum user withdrawal'), async () => {

                // Get amount to withdraw - half of deposit
                let userMiniPoolDeposit = await miniPools.first.getUserDeposit.call(userFirst);
                let withdrawalAmount = parseInt(userMiniPoolDeposit.valueOf()) / 2;

                // Set maximum user withdrawal below withdrawal amount
                await rocketSettings.setUserWithdrawalMax(withdrawalAmount - parseInt(web3.toWei('1', 'ether')));

                // Withdraw deposit
                await assertThrows(scenarioWithdrawDeposit({
                    miniPool: miniPools.first,
                    withdrawalAmount: withdrawalAmount,
                    fromAddress: userFirst,
                    feeAccountAddress: owner,
                    gas: rocketWithdrawalGas,
                }));

                // Reset maximum user withdrawal
                await rocketSettings.setUserWithdrawalMax(web3.toWei('75', 'ether'));

            });


            // User cannot withdraw from an unassociated minipool
            it(printTitle('user', 'cannot withdraw from an unassociated minipool'), async () => {
                await assertThrows(scenarioWithdrawDeposit({
                    miniPool: miniPools.second,
                    withdrawalAmount: 0,
                    fromAddress: userFirst,
                    feeAccountAddress: owner,
                    gas: rocketWithdrawalGas,
                }));
            });


            // Random address cannot withdraw as a user
            it(printTitle('random address', 'cannot withdraw as a user'), async () => {
                await assertThrows(scenarioWithdrawDeposit({
                    miniPool: miniPools.first,
                    withdrawalAmount: 0,
                    fromAddress: nodeFirst,
                    feeAccountAddress: owner,
                    gas: rocketWithdrawalGas,
                }));
            });


            // First user withdraws their deposit + rewards and pays Rocket Pools fee
            it(printTitle('userFirst', 'withdraws their deposit + Casper rewards from the minipool and pays their fee'), async () => {
                await scenarioWithdrawDeposit({
                    miniPool: miniPools.first,
                    withdrawalAmount: 0,
                    fromAddress: userFirst,
                    feeAccountAddress: owner,
                    gas: rocketWithdrawalGas,
                });
            });


            // Second user attempts to withdraw using their backup address before the time limit to do so is allowed (3 months by default)
            it(printTitle('userSecond', 'fails to withdraw using their backup address before the time limit to do so is allowed'), async () => {
                await assertThrows(scenarioWithdrawDeposit({
                    miniPool: miniPools.first,
                    withdrawalAmount: 0,
                    fromAddress: userSecondBackupAddress,
                    depositFromAddress: userSecond,
                    feeAccountAddress: owner,
                    gas: rocketWithdrawalGas,
                }));
            });


            // Update first minipool
            it(printTitle('---------', 'settings BackupCollectTime changed to 0 which will allow the user to withdraw via their backup address'), async () => {

                // Set the backup withdrawal period to 0 to allow the user to withdraw using their backup address
                let result = await rocketSettings.setMiniPoolBackupCollectTime(0, {from: owner, gas: 150000});
                // TODO: check backup withdrawal period, dummy test for now

            });


            // First user attempts to withdraw again
            it(printTitle('userFirst', "fails to withdraw again from the pool as they've already completed withdrawal"), async () => {
                await assertThrows(scenarioWithdrawDeposit({
                    miniPool: miniPools.first,
                    withdrawalAmount: 0,
                    fromAddress: userFirst,
                    feeAccountAddress: owner,
                    gas: rocketWithdrawalGas,
                }));
            });


            // Second user withdraws their deposit + rewards and pays Rocket Pools fee, minipool closes
            it(printTitle('userSecond', 'withdraws their deposit + Casper rewards using their backup address from the minipool, pays their fee and the pool closes'), async () => {
                await scenarioWithdrawDeposit({
                    miniPool: miniPools.first,
                    withdrawalAmount: 0,
                    fromAddress: userSecondBackupAddress,
                    depositFromAddress: userSecond,
                    feeAccountAddress: owner,
                    gas: rocketWithdrawalGas,
                });
            });


        });


    });

}
