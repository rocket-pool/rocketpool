import { RocketStorage } from '../artifacts';


// Writes boolean data to storage and asserts that data was written
export async function scenarioWriteBool({key, value, fromAddress, gas}) {
	const rocketStorage = await RocketStorage.deployed();

	// Write data
	await rocketStorage.setBool(key, value, {from: fromAddress, gas: gas});

	// Check value
	let setValue = await rocketStorage.getBool.call(key);
	assert.equal(setValue.valueOf(), value, 'Value was not updated correctly');

}

