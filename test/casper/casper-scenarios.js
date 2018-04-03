import { Casper, CasperValidation } from '../artifacts';


// Increments Casper epochs and dynasties and asserts current values are set correctly
// Increment parameter is an array of 'e' and 'd' to increment epoch and dynasty respectively
export async function scenarioIncrementEpochAndDynasty({increment, fromAddress}) {
    const casper = await Casper.deployed();

    // Get initial epoch and dynasty
    let casperEpochOld = await casper.get_current_epoch.call();
    let casperDynastyOld = await casper.get_dynasty.call();

    // Process increment flags
    let epochsPassed = 0, dynastiesPassed = 0;
    increment.forEach(async (t) => {
        switch (t) {

            // Increment epoch
            case 'e':
                await casper.set_increment_epoch({from: fromAddress});
                ++epochsPassed;
            break;

            // Increment dynasty
            case 'd':
                await casper.set_increment_dynasty({from: fromAddress});
                ++dynastiesPassed;
            break;

        }
    });

    // Get updated epoch and dynasty
    let casperEpochNew = await casper.get_current_epoch.call();
    let casperDynastyNew = await casper.get_dynasty.call();

    // Assert that updated epoch and dynasty match
    assert.equal(casperEpochNew.valueOf(), parseInt(casperEpochOld.valueOf()) + epochsPassed, 'Updated Casper epoch does not match');
    assert.equal(casperDynastyNew.valueOf(), parseInt(casperDynastyOld.valueOf()) + dynastiesPassed, 'Updated Casper dynasty does not match');

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

