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


import { RocketUser, RocketPool, RocketPoolMini } from '../artifacts';


export function rocketUserDepositTests2({
    owner,
    accounts,
    userThird,
    miniPools,
    rocketDepositGas
}) {

    describe('RocketUser - Deposit', async () => {


        // Contract dependencies
        let rocketSettings;
        before(async () => {
            rocketSettings = await RocketSettings.deployed();
        });


        let rocketUser;
        let rocketPool;
        before(async () => {
            rocketUser = await RocketUser.deployed();
            rocketPool = await RocketPool.deployed();
        });


        it(printTitle('userThird', 'sends a lot of ether to RP, creates second minipool, registers user with pool and sets status of minipool to countdown'), async () => {

            // Get the min ether required to launch a minipool
            const sendAmount = parseInt(await rocketSettings.getMiniPoolLaunchAmount.call().valueOf());

            const result = await rocketUser.userDeposit('short', {
                from: userThird,
                to: rocketPool.address,
                value: sendAmount,
                gas: rocketDepositGas,
            });

            const log = result.logs.find(({ event }) => event == 'Transferred');
            assert.notEqual(log, undefined); // Check that an event was logged

            const userSendAmount = parseInt(log.args.value);
            const userSendAddress = log.args._from;
            const poolAddress = log.args._to;

            // Get an instance of that pool and do further checks
            let miniPoolSecond = RocketPoolMini.at(poolAddress);
            miniPools.second = miniPoolSecond;

            const poolStatus = await miniPoolSecond.getStatus.call();
            const poolBalance = web3.eth.getBalance(miniPoolSecond.address).valueOf();
            const userPartnerAddress = await miniPoolSecond.getUserPartner.call(userThird).valueOf();

            assert.equal(poolStatus, 1, 'Invalid minipool status');
            assert.equal(userSendAmount, sendAmount, 'Invalid user send amount');
            assert.equal(userPartnerAddress, 0, 'Invalud user partner address');
            assert.isTrue(userSendAmount > 0, 'User send amount must be more than zero');

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
