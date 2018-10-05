// Dependencies
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketDepositAPI } from '../_lib/artifacts';


// Make a deposit
export async function scenarioDeposit({depositorContract, durationID, fromAddress, value, gas}) {

    // Deposit
    let result = await depositorContract.deposit(durationID, {from: fromAddress, value: value, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.deposit', result);

}


// Request a deposit refund
export async function scenarioRefundDeposit({depositorContract, durationID, depositID, fromAddress, gas}) {

	// Request refund
	let result = await depositorContract.refundDeposit(durationID, depositID, {from: fromAddress, gas: gas});

}


// Attempt a deposit via the deposit API
export async function scenarioAPIDeposit({groupID, userID, durationID, fromAddress, value, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Deposit
    await rocketDepositAPI.deposit(groupID, userID, durationID, {from: fromAddress, value: value, gas: gas});

}


// Attempt a deposit refund via the deposit API
export async function scenarioAPIRefundDeposit({groupID, userID, durationID, depositID, fromAddress, gas}) {
	const rocketDepositAPI = await RocketDepositAPI.deployed();

	// Request refund
    await rocketDepositAPI.refundDeposit(groupID, userID, durationID, depositID, {from: fromAddress, gas: gas});

}
