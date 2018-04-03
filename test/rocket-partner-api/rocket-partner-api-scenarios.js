import { RocketPartnerAPI } from '../artifacts';


// Registers partner and asserts that number of registered partners increased
export async function scenarioRegisterPartner({partnerAddress, partnerName, fromAddress, gas}) {
	const rocketPartnerAPI = await RocketPartnerAPI.deployed();

	// Get initial partner count
	let partnerCountOld = await rocketPartnerAPI.getPartnerCount.call();

	// Register partner
	await rocketPartnerAPI.partnerAdd(partnerAddress, partnerName, {
		from: fromAddress,
		gas: gas,
	});

	// Get updated partner count
	let partnerCountNew = await rocketPartnerAPI.getPartnerCount.call();

	// Assert that updated partner count is correct
    assert.equal(partnerCountNew.valueOf(), parseInt(partnerCountOld.valueOf()) + 1, 'Invalid number of partners registered');

}


// Makes a deposit with a partner
export async function scenarioPartnerDeposit({userAddress, stakingTimeID, fromAddress, value, gas}) {
	const rocketPartnerAPI = await RocketPartnerAPI.deployed();

	// Make deposit
	await rocketPartnerAPI.APIpartnerDeposit(userAddress, stakingTimeID, {
		from: fromAddress,
		value: value,
		gas: gas,
	});

	// TODO: add assertions

}

