// Dependencies
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketDepositAPI } from '../_lib/artifacts';

// Make a deposit
export async function scenarioDeposit({depositorContract, durationID, fromAddress, value, gas}) {

    // Deposit
    let result = await depositorContract.deposit(durationID, {from: fromAddress, value: value, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.deposit', result);

}


// Attempt a deposit via the deposit API
export async function scenarioAPIDeposit({groupID, userID, durationID, fromAddress, value, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Deposit
    await rocketDepositAPI.deposit(groupID, userID, durationID, {from: fromAddress, value: value, gas: gas});

}
