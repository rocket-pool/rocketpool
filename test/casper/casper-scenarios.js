import { Casper, CasperValidation } from '../artifacts';


// Increments Casper epoch and asserts current epoch is set correctly
export async function scenarioIncrementEpoch(fromAddress) {
    const casper = await Casper.deployed();
    let casperEpochOld = await casper.get_current_epoch.call();
    await casper.set_increment_epoch({from: fromAddress});
    let casperEpochNew = await casper.get_current_epoch.call();
    assert.equal(casperEpochNew.valueOf(), parseInt(casperEpochOld.valueOf()) + 1, 'Updated Casper epoch does not match');
}


// Increments Casper dynasty and asserts current dynasty is set correctly
export async function scenarioIncrementDynasty(fromAddress) {
    const casper = await Casper.deployed();
    let casperDynastyOld = await casper.get_dynasty.call();
    await casper.set_increment_dynasty({from: fromAddress});
    let casperDynastyNew = await casper.get_dynasty.call();
    assert.equal(casperDynastyNew.valueOf(), parseInt(casperDynastyOld.valueOf()) + 1, 'Updated Casper dynasty does not match');
}


// Creates validation contract and asserts contract was created successfully
export async function scenarioCreateValidationContract({fromAddress}) {

    // Create a blank contract for use in making validation address contracts
    // 500k gas limit @ 10 gwei TODO: Make these configurable on the smart node package by reading from RocketSettings contract so we can adjust when needed
    const valCodeContract = await CasperValidation.new({gas: 500000, gasPrice: 10000000000, from: fromAddress});

    // Assert that contract was created successfully
    assert.notEqual(valCodeContract.address, 0, 'Validation contract creation failed');

    // Return validation contract address
    return valCodeContract.address;

}

