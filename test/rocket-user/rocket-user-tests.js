import { printTitle, assertThrows } from '../utils';
import { RocketSettings } from '../artifacts';
import { scenarioDeposit, scenarioRegisterWithdrawalAddress, scenarioWithdrawDeposit } from './rocket-user-scenarios';


export function rocketUserDepositTests1({
    owner,
    accounts,
    userFirst,
    userSecond,
    miniPools,
    rocketDepositGas
}) {

    describe('RocketUser - Deposit', async () => {


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
                fromAddress: userSecond,
                depositAmount: sendAmount,
                gas: rocketDepositGas,
            });

        });


    });

}

export function rocketUserWithdrawalAddressTests({
    owner,
    accounts,
    userSecond,
    userSecondBackupAddress,
    miniPools
}) {

    describe('RocketUser - Withdrawal Address', async () => {


        // Second user sets a backup withdrawal address
        it(printTitle('userSecond', 'registers a backup withdrawal address on their deposit while minipool is in countdown'), async () => {
            await scenarioRegisterWithdrawalAddress({
                withdrawalAddress: userSecondBackupAddress,
                miniPoolAddress: miniPools.first.address,
                fromAddress: userSecond,
                gas: 550000,
            });
        });


    });

}

export function rocketUserWithdrawalTests({
    owner,
    accounts,
    userFirst,
    miniPools,
    rocketWithdrawalGas
}) {

    describe('RocketUser - Withdrawal', async () => {


        // First user with deposit staking in minipool attempts to withdraw deposit before staking has finished
        it(printTitle('userFirst', 'user fails to withdraw deposit while minipool is staking'), async () => {
            await assertThrows(scenarioWithdrawDeposit({
                miniPoolAddress: miniPools.first.address,
                withdrawalAmount: 0,
                fromAddress: userFirst,
                gas: rocketWithdrawalGas,
            }));
        });


    });

}
