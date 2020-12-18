import { RocketDAONodeTrusted } from '../_utils/artifacts';


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
export async function setDAONodeTrustedBootstrapSetting(_settingPath, _value, txOptions) {

    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getSettingUint.call(_settingPath),
        ]).then(
            ([settingUintValue]) =>
            ({settingUintValue})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    //console.log(Number(ds1.settingValue));

    // Set as a bootstrapped member
    await rocketDAONodeTrusted.bootstrapSettingUint(_settingPath, _value, txOptions);

    // Capture data
    let ds2 = await getTxData();
    //console.log(Number(ds2.settingValue));

    // Check it was updated
    assert(ds2.settingUintValue.eq(web3.utils.toBN(_value)), 'DAO setting not updated in bootstrap mode');

}

