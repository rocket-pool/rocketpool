import { RocketDAONodeTrusted, RocketDAONodeTrustedSettingsMembers } from '../_utils/artifacts';


// The trusted node DAO can be bootstrapped with several nodes
export async function setDaoNodeTrustedBootstrapMember(_id, _email, _nodeAddress, txOptions) {

    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getMemberID.call(_nodeAddress),
        ]).then(
            ([memberID]) =>
            ({memberID})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Set as a bootstrapped member
    await rocketDAONodeTrusted.bootstrapMember(_id, _email, _nodeAddress, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check ID has been recorded
    assert(ds2.memberID == _id, 'Member was not invited to join correctly');

}


// Change a trusted node DAO setting while bootstrap mode is enabled
export async function setDAONodeTrustedBootstrapSetting(_settingContractInstance, _settingPath, _value, txOptions) {

    // Helper function
    String.prototype.lowerCaseFirstLetter = function() {
        return this.charAt(0).toLowerCase() + this.slice(1);
    }

    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const rocketDAONodeTrustedSettingsContract = await _settingContractInstance.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrustedSettingsContract.getSettingUint.call(_settingPath),
            rocketDAONodeTrustedSettingsContract.getSettingBool.call(_settingPath)
        ]).then(
            ([settingUintValue, settingBoolValue]) =>
            ({settingUintValue, settingBoolValue})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    //console.log(Number(ds1.settingValue));

    // Set as a bootstrapped setting. detect type first, can be a number, string or bn object
    if(typeof(_value) == 'number' || typeof(_value) == 'string' || typeof(_value) == 'object') await rocketDAONodeTrusted.bootstrapSettingUint(_settingContractInstance._json.contractName.lowerCaseFirstLetter(), _settingPath, _value, txOptions);
    if(typeof(_value) == 'boolean') await rocketDAONodeTrusted.bootstrapSettingBool(_settingContractInstance._json.contractName.lowerCaseFirstLetter(), _settingPath, _value, txOptions);
    
    // Capture data
    let ds2 = await getTxData();

    // Check it was updated
    if(typeof(_value) == 'number' || typeof(_value) == 'string') await assert(ds2.settingUintValue.eq(web3.utils.toBN(_value)), 'DAO node trusted uint256 setting not updated in bootstrap mode');
    if(typeof(_value) == 'boolean')  await assert(ds2.settingBoolValue == _value, 'DAO node trusted boolean setting not updated in bootstrap mode');


}


// Disable bootstrap mode
export async function setDaoNodeTrustedBootstrapModeDisabled(txOptions) {

    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getBootstrapModeDisabled.call(),
        ]).then(
            ([bootstrapmodeDisabled]) =>
            ({bootstrapmodeDisabled})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Set as a bootstrapped member
    await rocketDAONodeTrusted.bootstrapDisable(true, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check ID has been recorded
    assert(ds2.bootstrapmodeDisabled == true, 'Bootstrap mode was not disabled');

}

