// Make a deposit
export async function scenarioDeposit({depositorContract, durationID, fromAddress, value, gas}) {

    // Deposit
    await depositorContract.deposit(durationID, {from: fromAddress, value: value, gas: gas});

}
