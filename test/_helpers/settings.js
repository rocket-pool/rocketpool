import { RocketAuctionSettings, RocketDAONetworkSettings, RocketDepositSettings, RocketMinipoolSettings, RocketNetworkSettings, RocketNodeSettings } from '../_utils/artifacts';


// Auction settings
export async function getAuctionSetting(setting) {
    const rocketAuctionSettings = await RocketAuctionSettings.deployed();
    let value = await rocketAuctionSettings['get' + setting].call();
    return value;
}
export async function setAuctionSetting(setting, value, txOptions) {
    const rocketAuctionSettings = await RocketAuctionSettings.deployed();
    await rocketAuctionSettings['set' + setting](value, txOptions);
}


// DAO settings
export async function getDAOSetting(setting) {
    const rocketDAONetworkSettings = await RocketDAONetworkSettings.deployed();
    let value = await rocketDAONetworkSettings['get' + setting].call();
    return value;
}


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


// Minipool settings
export async function getMinipoolSetting(setting) {
    const rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
    let value = await rocketMinipoolSettings['get' + setting].call();
    return value;
}
export async function setMinipoolSetting(setting, value, txOptions) {
    const rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
    await rocketMinipoolSettings['set' + setting](value, txOptions);
}


// Network settings
export async function getNetworkSetting(setting) {
    const rocketNetworkSettings = await RocketNetworkSettings.deployed();
    let value = await rocketNetworkSettings['get' + setting].call();
    return value;
}
export async function setNetworkSetting(setting, value, txOptions) {
    const rocketNetworkSettings = await RocketNetworkSettings.deployed();
    await rocketNetworkSettings['set' + setting](value, txOptions);
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

