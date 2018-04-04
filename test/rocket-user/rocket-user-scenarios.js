import { RocketUser } from '../artifacts';


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

