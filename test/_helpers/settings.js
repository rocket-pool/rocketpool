import { RocketDepositSettings } from '../_utils/artifacts';


// Update a deposit setting
export async function setDepositSetting({setting, value, from}) {
    const rocketDepositSettings = await RocketDepositSettings.deployed();
    await rocketDepositSettings['set' + setting](value, {from});
}
