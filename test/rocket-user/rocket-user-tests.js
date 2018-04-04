import { printTitle, assertThrows } from '../utils';
import { RocketSettings } from '../artifacts';
import { scenarioRegisterWithdrawalAddress, scenarioWithdrawDeposit } from './rocket-user-scenarios';


import { RocketUser, RocketPoolMini } from '../artifacts';


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



        let rocketUser;
        before(async () => {
            rocketUser = await RocketUser.deployed();
        });



        // Send Ether to Rocket pool with just less than the min amount required to launch a minipool with no specified 3rd party user partner
        it(printTitle('userFirst', 'sends ether to RP, create first minipool, registers user with pool'), async () => {
            // Get the min ether required to launch a minipool
            const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call().valueOf();

            // Send Ether as a user, but send just enough to create the pool, but not launch it
            const sendAmount = parseInt(minEtherRequired) - parseInt(web3.toWei('2', 'ether'));

            const result = await rocketUser.userDeposit('short', {
                from: userFirst,
                to: rocketUser.address,
                value: sendAmount,
                gas: rocketDepositGas,
            });

            const log = result.logs.find(({ event }) => event == 'Transferred');
            assert.notEqual(log, undefined); // Check that an event was logged

            const poolAddress = log.args._to;

            // Get an instance of that pool and do further checks
            let miniPoolFirst = RocketPoolMini.at(poolAddress);
            miniPools.first = miniPoolFirst;

            const poolStatus = await miniPoolFirst.getStatus.call().valueOf();
            const poolBalance = web3.eth.getBalance(miniPoolFirst.address).valueOf();

            assert.equal(poolStatus, 0, 'Invalid minipool status');
            assert.equal(poolBalance, sendAmount, 'Invalid minipool balance');
        });


        // Have the same initial user send an deposit again, to trigger the pool to go into countdown
        it(printTitle('userFirst', 'sends ether to RP again, their balance updates, first minipool remains accepting deposits and only 1 reg user'), async () => {
            // Get the min ether required to launch a minipool
            const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call().valueOf();

            // Send Ether as a user, send enough not to trigger the pool to enter countdown status for launch
            const sendAmount = web3.toWei('1', 'ether');

            const result = await rocketUser.userDeposit('short', {
                from: userFirst,
                to: rocketUser.address,
                value: sendAmount,
                gas: rocketDepositGas,
            });

            const log = result.logs.find(({ event }) => event == 'Transferred');
            assert.notEqual(log, undefined); // Check that an event was logged

            const userSendAmount = log.args.value;
            const userSendAddress = log.args._from;
            const poolAddress = log.args._to;

            // Get the instance the prev minipool
            const miniPool = RocketPoolMini.at(poolAddress);

            // Get the pool status
            const poolStatus = await miniPool.getStatus.call().valueOf();
            const poolBalance = web3.eth.getBalance(miniPool.address).valueOf();

            // Now just count the users to make sure this user wasn't added twice
            const userCount = await miniPool.getUserCount.call().valueOf();
            const userResult = await miniPool.getUser.call(userFirst);
            return;
            const user = userResult.valueOf();
            const userBalance = userResult[1].valueOf();

            assert.equal(userSendAmount, sendAmount, 'Invalid user send amount');
            assert.equal(poolStatus, 0, 'Invalid minipool status');
            assert.isTrue(poolBalance > sendAmount, 'Invalid minipool balance');
            assert.equal(userCount, 1, 'Invalid user count');
            assert.equal(userBalance, minEtherRequired - web3.toWei('1', 'ether'), 'Invalid user balance');
        });


        // Have a new user send an deposit, to trigger the pool to go into countdown
        it(printTitle('userSecond', 'sends ether to RP, first minipool status changes to countdown and only 2 reg users'), async () => {
            // Get the min ether required to launch a minipool
            const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call().valueOf();
            // Send Ether as a user, send enough not to trigger the pool to enter countdown status for launch
            const sendAmount = web3.toWei('5', 'ether');

            const result = await rocketUser.userDeposit('short', {
                from: userSecond,
                to: rocketUser.address,
                value: sendAmount,
                gas: rocketDepositGas,
            });

            const log = result.logs.find(({ event }) => event == 'Transferred');
            assert.notEqual(log, undefined); // Check that an event was logged

            const userSendAmount = log.args.value;
            const userSendAddress = log.args._from;
            const poolAddress = log.args._to;

            // Get the instance the prev minipool
            const miniPool = RocketPoolMini.at(poolAddress);
            const poolStatus = await miniPool.getStatus.call().valueOf();
            const poolBalance = web3.eth.getBalance(miniPool.address).valueOf();

            // Now just count the users to make sure this user wasn't added twice
            const userCount = await miniPool.getUserCount.call().valueOf();

            assert.equal(userSendAmount, sendAmount, 'Invalid user send amount');
            assert.equal(poolStatus, 1, 'Invalid minipool status');
            assert.equal(userCount, 2, 'Invalid user count');
            assert.isTrue(poolBalance > sendAmount, 'Invalid minipool balance');
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
