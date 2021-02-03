import { RocketDAOProtocolSettingsDeposit, RocketMinipoolSettings, RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts';
import { RocketDAOProtocolSettingsNode } from '../_utils/artifacts';
import { setDAONetworkBootstrapSetting } from '../dao/scenario-dao-network-bootstrap';


// Set a deposit setting
export async function setDepositSetting(setting, value, txOptions) {
    await setSetting(RocketDAOProtocolSettingsDeposit, setting, value, txOptions);
}


// Set a minipool setting
export async function setMinipoolSetting(setting, value, txOptions) {
    await setSetting(RocketMinipoolSettings, setting, value, txOptions);
}


// Set a network setting
export async function setNetworkSetting(setting, value, txOptions) {
    await setSetting(RocketDAOProtocolSettingsNetwork, setting, value, txOptions);
}

// Set a setting
async function setSetting(SettingsContract, setting, value, txOptions) {

    // Load contracts
    const settingsContract = await SettingsContract.deployed();

    // Set setting
    await settingsContract['set' + setting](value, txOptions);

    // Get & check updated setting value
    let newValue = await settingsContract['get' + setting].call();
    if (newValue.eq) assert(newValue.eq(value), 'Incorrect updated setting value');
    else assert.equal(newValue, value, 'Incorrect updated setting value');

}

