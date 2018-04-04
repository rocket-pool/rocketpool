import { RocketUser, RocketPoolMini } from '../artifacts';


// Deposits ether with RocketPool
export async function scenarioDeposit({fromAddress, depositAmount, gas}) {
    const rocketUser = await RocketUser.deployed();

    // Deposit ether
    let result = await rocketUser.userDeposit('short', {
        from: fromAddress,
        to: rocketUser.address,
        value: depositAmount,
        gas: gas,
    });

    // Assert Transferred event was logged
    let log = result.logs.find(({ event }) => event == 'Transferred');
    assert.notEqual(log, undefined, 'Transferred event was not logged');

    // Get an instance of the minipool the deposit was sent to
    let miniPoolAddress = log.args._to;
    let miniPool = RocketPoolMini.at(miniPoolAddress);

    // Get minipool properties
    let miniPoolStatus = await miniPool.getStatus.call();
    let miniPoolBalance = web3.eth.getBalance(miniPool.address);

    // Assert that minipool was created with the correct status and balance
    assert.equal(miniPoolStatus.valueOf(), 0, 'Invalid minipool status');
    assert.equal(miniPoolBalance.valueOf(), depositAmount, 'Invalid minipool balance');

    // Return minipool instance
    return miniPool;

}


// Registers a backup withdrawal address and asserts withdrawal address was set correctly
export async function scenarioRegisterWithdrawalAddress({withdrawalAddress, miniPoolAddress, fromAddress, gas}) {
    const rocketUser = await RocketUser.deployed();

    // Register withdrawal address
    let result = await rocketUser.userSetWithdrawalDepositAddress(withdrawalAddress, miniPoolAddress, {
        from: fromAddress,
        gas: gas,
    });

    // Assert UserSetBackupWithdrawalAddress event was logged
    let log = result.logs.find(({ event }) => event == 'UserSetBackupWithdrawalAddress');
    assert.notEqual(log, undefined, 'UserSetBackupWithdrawalAddress event was not logged');

    // Assert withdrawal address was set correctly
    let newBackupAddress = log.args._userBackupAddress;
    assert.equal(newBackupAddress, withdrawalAddress, 'Withdrawal address does not match');

}


// Withdraws staking deposit
export async function scenarioWithdrawDeposit({miniPoolAddress, withdrawalAmount, fromAddress, gas}) {
    const rocketUser = await RocketUser.deployed();

    // Withdraw deposit
    await rocketUser.userWithdraw(miniPoolAddress, withdrawalAmount, {
        from: fromAddress,
        gas: gas,
    });

    // TODO: add assertions

}

