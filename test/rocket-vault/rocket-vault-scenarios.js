import { assertThrows, soliditySha3 } from '../utils';
import { RocketStorage, RocketVault, RocketDepositToken } from "../artifacts";

/** SCENARIOS */

// Runs add account scenario and asserts that the new account has been recorded correctly
export async function scenarioAddAccount({accountName, ownerAddress, tokenContractAddress = 0x0, depositsEnabled, withdrawalsEnabled}){
    const rocketVault = await RocketVault.deployed();

    await rocketVault.setAccountAdd(accountName, tokenContractAddress, {from: ownerAddress});

    // await assertAccount({
    //     accountName: accountName, 
    //     ownerAddress: ownerAddress, 
    //     tokenContractAddress: tokenContractAddress,
    //     depositsEnabled: depositsEnabled, 
    //     withdrawalsEnabled: withdrawalsEnabled
    // });
};

// Runs deposit enabling scenario and asserts recorded correctly
export async function scenarioDepositEnabling({accountName, accountToTestEnabling}){
    const rocketVault = await RocketVault.deployed();

    // test to make sure deposits are enabled (should be on creation)
    let depositsEnabled = await rocketVault.getAccountDepositsEnabled(accountName);
    assert.isTrue(depositsEnabled, "Account deposits should be initially enabled on creation.");

    // account disables deposits
    await rocketVault.setAccountDepositsEnabled(accountName, false, {from: accountToTestEnabling});

    // test to make sure deposits are disabled
    depositsEnabled = await rocketVault.getAccountDepositsEnabled(accountName);
    assert.isFalse(depositsEnabled, "Account deposits should be disabled.");

    // account enables deposits
    await rocketVault.setAccountDepositsEnabled(accountName, true, {from: accountToTestEnabling});

    // test to make sure deposits are back to enabled
    depositsEnabled = await rocketVault.getAccountDepositsEnabled(accountName);
    assert.isTrue(depositsEnabled, "Account deposits should be enabled.");
}

// Runs withdrawal enabling scenario and asserts recorded correctly
export async function sceanarioWithdrawalsEnabling({accountName, accountToTestEnabling}){
    const rocketVault = await RocketVault.deployed();

    // test to make sure withdrawals are enabled (should be on creation)
    let withdrawalEnabled = await rocketVault.getAccountWithdrawalsEnabled(accountName);
    assert.isTrue(withdrawalEnabled, "Account withdrawaks should be initially enabled on creation.");

    // accountr disables withdrawals
    await rocketVault.setAccountWithdrawalsEnabled(accountName, false, {from: accountToTestEnabling});

    // test to make sure withdrawals are disabled
    withdrawalEnabled = await rocketVault.getAccountWithdrawalsEnabled(accountName);
    assert.isFalse(withdrawalEnabled, "Account withdrawals should be disabled.");

    // account enables withdrawals
    await rocketVault.setAccountWithdrawalsEnabled(accountName, true, {from: accountToTestEnabling});

    // test to make sure withdrawals are back to enabled
    withdrawalEnabled = await rocketVault.getAccountWithdrawalsEnabled(accountName);
    assert.isTrue(withdrawalEnabled, "Account withdrawals should be enabled.");
}

// Runs allow deposits scenario and asserts deposits work while address is allowed
export async function scenarioAllowDeposits({accountName, depositAddress, fromAddress}) {
    const rocketVault = await RocketVault.deployed();

    // Allow deposits
    await rocketVault.setAccountDepositsAllowed(accountName, depositAddress, true, {from: fromAddress});

    // Deposit ether from address
    await scenarioDepositEther({
        accountName,
        fromAddress: depositAddress,
        depositAmount: web3.toWei('1', 'ether'),
    });

    // Disallow deposits
    await rocketVault.setAccountDepositsAllowed(accountName, depositAddress, false, {from: fromAddress});

    // Deposit ether from address
    await assertThrows(scenarioDepositEther({
        accountName,
        fromAddress: depositAddress,
        depositAmount: web3.toWei('1', 'ether'),
    }), 'disallowed address deposited ether into account');

}

// Runs allow withdrawals scenario and asserts withdrawals work while address is allowed
export async function scenarioAllowWithdrawals({accountName, withdrawalAddress, withdrawToAddress, fromAddress}) {
    const rocketVault = await RocketVault.deployed();

    // Allow withdrawals
    await rocketVault.setAccountWithdrawalsAllowed(accountName, withdrawalAddress, true, {from: fromAddress});

    // Withdraw ether to address
    await scenarioWithdrawEther({
        accountName,
        fromAddress: withdrawalAddress,
        withdrawalAddress: withdrawToAddress,
        withdrawalAmount: web3.toWei('1', 'ether'),
    });

    // Disallow withdrawals
    await rocketVault.setAccountWithdrawalsAllowed(accountName, withdrawalAddress, false, {from: fromAddress});

    // Withdraw ether to address
    await assertThrows(scenarioWithdrawEther({
        accountName,
        fromAddress: withdrawalAddress,
        withdrawalAddress: withdrawToAddress,
        withdrawalAmount: web3.toWei('1', 'ether'),
    }), 'disallowed address withdrew ether from account');

}

// Deposits ether to account and asserts balances updated correctly
export async function scenarioDepositEther({accountName, fromAddress, depositAmount}) {
    const rocketVault = await RocketVault.deployed();

    // Get old vault & account balances
    let vaultBalanceOld = web3.eth.getBalance(rocketVault.address).valueOf();
    let accountBalanceOld = await rocketVault.getBalance(accountName);

    // Deposit ether
    await rocketVault.deposit(accountName, 0, {from: fromAddress, value: depositAmount});

    // Get new vault & account balances
    let vaultBalanceNew = web3.eth.getBalance(rocketVault.address).valueOf();
    let accountBalanceNew = await rocketVault.getBalance(accountName);

    assert.notEqual(vaultBalanceOld, vaultBalanceNew, 'Vault ether balance was not increased');
    assert.notEqual(accountBalanceOld.valueOf(), accountBalanceNew.valueOf(), 'Account ether balance was not increased');
    assert.equal((vaultBalanceNew - vaultBalanceOld), (accountBalanceNew.valueOf() - accountBalanceOld.valueOf()), 'Account ether balance was updated incorrectly');

}

// Withdraws ether from account to address and asserts balances updated correctly
export async function scenarioWithdrawEther({accountName, fromAddress, withdrawalAddress, withdrawalAmount}) {
    const rocketVault = await RocketVault.deployed();

    // Get old address & account balances
    let addressBalanceOld = web3.eth.getBalance(withdrawalAddress).valueOf();
    let accountBalanceOld = await rocketVault.getBalance(accountName);

    // Withdraw ether
    await rocketVault.withdraw(accountName, withdrawalAmount, withdrawalAddress, {from: fromAddress});

    // Get new address & account balances
    let addressBalanceNew = web3.eth.getBalance(withdrawalAddress).valueOf();
    let accountBalanceNew = await rocketVault.getBalance(accountName);

    assert.notEqual(addressBalanceOld, addressBalanceNew, 'Address ether balance was not increased');
    assert.notEqual(accountBalanceOld.valueOf(), accountBalanceNew.valueOf(), 'Account ether balance was not decreased');
    assert.equal((addressBalanceNew - addressBalanceOld), (accountBalanceOld.valueOf() - accountBalanceNew.valueOf()), 'Account ether balance was updated incorrectly');

}

// Deposits tokens to account and asserts balances updated correctly
export async function scenarioDepositTokens({accountName, fromAddress, depositAmount}) {
    const rocketVault = await RocketVault.deployed();
    const rocketDepositToken = await RocketDepositToken.deployed();

    // Get old vault & account balances
    let vaultBalanceOld = await rocketDepositToken.balanceOf(rocketVault.address);
    let accountBalanceOld = await rocketVault.getBalance(accountName);

    // Allow deposit & deposit tokens
    await rocketDepositToken.approve(rocketVault.address, depositAmount, {from: fromAddress});
    await rocketVault.deposit(accountName, depositAmount, {from: fromAddress});

    // Get new vault & account balances
    let vaultBalanceNew = await rocketDepositToken.balanceOf(rocketVault.address);
    let accountBalanceNew = await rocketVault.getBalance(accountName);

    assert.notEqual(vaultBalanceOld.valueOf(), vaultBalanceNew.valueOf(), 'Vault token balance was not increased');
    assert.notEqual(accountBalanceOld.valueOf(), accountBalanceNew.valueOf(), 'Account token balance was not increased');
    assert.equal((vaultBalanceNew.valueOf() - vaultBalanceOld.valueOf()), (accountBalanceNew.valueOf() - accountBalanceOld.valueOf()), 'Account token balance was updated incorrectly');

}

// Withdraws tokens from account to address and asserts balances updated correctly
export async function scenarioWithdrawTokens({accountName, fromAddress, withdrawalAddress, withdrawalAmount}) {
    const rocketVault = await RocketVault.deployed();
    const rocketDepositToken = await RocketDepositToken.deployed();

    // Get old address & account balances
    let addressBalanceOld = await rocketDepositToken.balanceOf(withdrawalAddress);
    let accountBalanceOld = await rocketVault.getBalance(accountName);

    // Withdraw tokens
    await rocketVault.withdraw(accountName, withdrawalAmount, withdrawalAddress, {from: fromAddress});

    // Get new address & account balances
    let addressBalanceNew = await rocketDepositToken.balanceOf(withdrawalAddress);
    let accountBalanceNew = await rocketVault.getBalance(accountName);

    assert.notEqual(addressBalanceOld.valueOf(), addressBalanceNew.valueOf(), 'Address token balance was not increased');
    assert.notEqual(accountBalanceOld.valueOf(), accountBalanceNew.valueOf(), 'Account token balance was not decreased');
    assert.equal((addressBalanceNew.valueOf() - addressBalanceOld.valueOf()), (accountBalanceOld.valueOf() - accountBalanceNew.valueOf()), 'Account token balance was updated incorrectly');

}

/** ASSERTS */

// Asserts that an account has been recorded correctly
export async function assertAccount({accountName, ownerAddress, tokenContractAddress, depositsEnabled, withdrawalsEnabled}){
    const rocketStorage = await RocketStorage.deployed();

    const recordedAccountName = await rocketStorage.getString(soliditySha3("vault.account", accountName));
    assert.equal(recordedAccountName, accountName, "Account name not set for new account.");
    const recordedOwner = await rocketStorage.getAddress(soliditySha3("vault.account.owner", accountName));
    assert.equal(recordedOwner, ownerAddress, 'Account owner is not set to owner');
    const recordedDepositEnabled = await rocketStorage.getBool(soliditySha3("vault.account.deposit.enabled", accountName));
    assert.isTrue(recordedDepositEnabled, 'Deposits should be enabled by default for new accounts.');
    const recordedWithdrawalEnabled = await rocketStorage.getBool(soliditySha3("vault.account.withdrawal.enabled", accountName));
    assert.isTrue(recordedWithdrawalEnabled, 'Withdrawals should be enabled by default for new accounts.');
    const recordedTokenContract = await rocketStorage.getAddress(soliditySha3("vault.account.token.address", accountName));
    assert.equal(recordedTokenContract, tokenContractAddress, "Token contract should equal provided address");
};