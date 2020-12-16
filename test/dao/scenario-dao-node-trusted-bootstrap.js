import { RocketDAONodeTrusted } from '../_utils/artifacts';


// The trusted node DAO can be bootstrapped with several nodes
export async function setDaoNodeTrustedBootstrapMember(_id, _email, _nodeAddress, txOptions) {

    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getMemberCount.call(),
            rocketDAONodeTrusted.getMemberIsValid.call(_nodeAddress),
        ]).then(
            ([memberCount, memberIsValid]) =>
            ({memberCount, memberIsValid})
        );
    }

    // Capture data
    let ds1 = await getTxData();


    // Set as a bootstrapped member
    await rocketDAONodeTrusted.bootstrapMember(_id, _email, _nodeAddress, txOptions);

    // Capture data
    let ds2 = await getTxData();

    let lastMemberAddress = await rocketDAONodeTrusted.getMemberAt.call(ds2.memberCount.sub(web3.utils.toBN(1)));

    // Check trusted node index
    assert(ds2.memberCount.eq(ds1.memberCount.add(web3.utils.toBN(1))), 'Incorrect updated trusted node count');
    assert.equal(lastMemberAddress, _nodeAddress, 'Incorrect updated trusted node index');

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
    await rocketDAONodeTrusted.bootstrapSetting(_settingPath, _value, txOptions);

    // Capture data
    let ds2 = await getTxData();
    //console.log(Number(ds2.settingValue));

    // Check it was updated
    assert(ds2.settingUintValue.eq(web3.utils.toBN(_value)), 'DAO setting not updated in bootstrap mode');

}

