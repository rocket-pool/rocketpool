import { RocketDepositSettings } from '../_utils/artifacts';


// Deposit settings
export async function getDepositSetting(setting) {
	const rocketDepositSettings = await RocketDepositSettings.deployed();
	let value = await rocketDepositSettings['get' + setting].call();
	return value;
}
export async function setDepositSetting(setting, value, txOptions) {
    const rocketDepositSettings = await RocketDepositSettings.deployed();
    await rocketDepositSettings['set' + setting](value, txOptions);
}
