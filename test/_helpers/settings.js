import { RocketDepositSettings, RocketNodeSettings } from '../_utils/artifacts';


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


// Node settings
export async function getNodeSetting(setting) {
    const rocketNodeSettings = await RocketNodeSettings.deployed();
    let value = await rocketNodeSettings['get' + setting].call();
    return value;
}
export async function setNodeSetting(setting, value, txOptions) {
    const rocketNodeSettings = await RocketNodeSettings.deployed();
    await rocketNodeSettings['set' + setting](value, txOptions);
}

