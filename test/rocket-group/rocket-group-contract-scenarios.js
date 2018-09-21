// Set a group's fee percentage
export async function scenarioSetFeePerc({groupContract, stakingFee, fromAddress, gas}) {

    // Set fee percentage
    await groupContract.setFeePerc(stakingFee, {from: fromAddress, gas: gas});

    // Get fee percentage
    let feePerc = parseInt(await groupContract.getFeePerc.call());

    // Asserts
    assert.equal(feePerc, stakingFee, 'Staking fee was not successfully updated');

}
