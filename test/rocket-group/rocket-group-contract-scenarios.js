// Set a group's fee percentage
export async function scenarioSetFeePerc({groupContract, stakingFee, fromAddress, gas}) {

    // Set fee percentage
    await groupContract.setFeePerc(stakingFee, {from: fromAddress, gas: gas});

    // Get fee percentage
    let feePerc = parseInt(await groupContract.getFeePerc.call());

    // Asserts
    assert.equal(feePerc, stakingFee, 'Staking fee was not successfully updated');

}


// Add a depositor to the group
export async function scenarioAddDepositor({groupContract, depositorAddress, fromAddress, gas}) {

    // Add depositor
    await groupContract.addDepositor(depositorAddress, {from: fromAddress, gas: gas});

    // Check depositor
    let hasDepositor = await groupContract.hasDepositor.call(depositorAddress);

    // Asserts
    assert.isTrue(hasDepositor, 'Depositor was not added successfully');

}


// Remove a depositor from the group
export async function scenarioRemoveDepositor({groupContract, depositorAddress, fromAddress, gas}) {

    // Remove depositor
    await groupContract.removeDepositor(depositorAddress, {from: fromAddress, gas: gas});

    // Check depositor
    let hasDepositor = await groupContract.hasDepositor.call(depositorAddress);

    // Asserts
    assert.isFalse(hasDepositor, 'Depositor was not removed successfully');

}


// Add a withdrawer to the group
export async function scenarioAddWithdrawer({groupContract, withdrawerAddress, fromAddress, gas}) {

    // Add withdrawer
    await groupContract.addWithdrawer(withdrawerAddress, {from: fromAddress, gas: gas});

    // Check withdrawer
    let hasWithdrawer = await groupContract.hasWithdrawer.call(withdrawerAddress);

    // Asserts
    assert.isTrue(hasWithdrawer, 'Withdrawer was not added successfully');

}


// Remove a withdrawer from the group
export async function scenarioRemoveWithdrawer({groupContract, withdrawerAddress, fromAddress, gas}) {

    // Remove withdrawer
    await groupContract.removeWithdrawer(withdrawerAddress, {from: fromAddress, gas: gas});

    // Check withdrawer
    let hasWithdrawer = await groupContract.hasWithdrawer.call(withdrawerAddress);

    // Asserts
    assert.isFalse(hasWithdrawer, 'Withdrawer was not removed successfully');

}

