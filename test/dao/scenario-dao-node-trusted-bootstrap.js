import { RocketDAONodeTrusted, RocketDAONodeTrustedUpgrade, RocketStorage, RocketVault, RocketTokenRPL } from '../_utils/artifacts';
import { compressABI, decompressABI } from '../_utils/contract';


// The trusted node DAO can be bootstrapped with several nodes
export async function setDaoNodeTrustedBootstrapMember(_id, _url, _nodeAddress, txOptions) {

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
    await rocketDAONodeTrusted.bootstrapMember(_id, _url, _nodeAddress, txOptions);

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


// The trusted node DAO can also upgrade contracts + abi if consensus is reached 
export async function setDaoNodeTrustedBootstrapUpgrade(_type, _name, _abi, _contractAddress, txOptions) {

    // Load contracts
    const [
        rocketStorage,
        rocketDAONodeTrusted,
    ] = await Promise.all([
        RocketStorage.deployed(),
        RocketDAONodeTrusted.deployed(),
    ]);

    // Add test method to ABI
    let compressedAbi = ''
    if (Array.isArray(_abi)){
        let testAbi = _abi.slice();
        testAbi.push({
            "constant": true,
            "inputs": [],
            "name": "testMethod",
            "outputs": [{
                "name": "",
                "type": "uint8"
            }],
            "payable": false,
            "stateMutability": "view",
            "type": "function",
        });
        compressedAbi = compressABI(testAbi);
    }

    // Get contract data
    function getContractData() {
        return Promise.all([
            rocketStorage.getAddress.call(web3.utils.soliditySha3('contract.address', _name)),
            rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', _name)),
        ]).then(
            ([address, abi]) =>
            ({address, abi})
        );
    }
    function getContractAddressData(_contractAddress) {
        return Promise.all([
            rocketStorage.getBool.call(web3.utils.soliditySha3('contract.exists', _contractAddress)),
            rocketStorage.getString.call(web3.utils.soliditySha3('contract.name', _contractAddress)),
        ]).then(
            ([exists, name]) =>
            ({exists, name})
        );
    }

    // Get initial contract data
    let contract1 = await getContractData();

    // console.log(_type, _name, _contractAddress);

    // Upgrade contract
    await rocketDAONodeTrusted.bootstrapUpgrade(_type, _name, compressedAbi, _contractAddress, txOptions);

    // Get updated contract data
    let contract2 = await getContractData();
    let [oldContractData, newContractData] = await Promise.all([
        getContractAddressData(contract1.address),
        getContractAddressData(contract2.address),
    ]);

    // Initialise new contract from stored data
    let newContract = new web3.eth.Contract(decompressABI(contract2.abi), contract2.address);

    // Check different assertions based on upgrade type
    if(_type == 'upgradeContract') {
        // Check contract details
        assert.equal(contract2.address, _contractAddress, 'Contract address was not successfully upgraded');
        assert.notEqual(newContract.methods.testMethod, undefined, 'Contract ABI was not successfully upgraded');
        assert.isFalse(oldContractData.exists, 'Old contract address exists flag was not unset');
        assert.equal(oldContractData.name, '', 'Old contract address name was not unset');
        assert.isTrue(newContractData.exists, 'New contract exists flag was not set');
        assert.notEqual(newContractData.name, '', 'New contract name was not set');
    }
    if(_type == 'addContract') {
        // Check contract details
        assert.equal(contract2.address, _contractAddress, 'Contract address was not set');
        assert.notEqual(newContract.methods.testMethod, undefined, 'Contract ABI was not set');
        assert.isTrue(newContractData.exists, 'New contract exists flag was not set');
        assert.notEqual(newContractData.name, '', 'New contract name was not set');
    }
    if(_type == 'upgradeABI' || _type == 'addABI') {
        // Check ABI details
        let contractAbi = await rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', _name));
        let contract = new web3.eth.Contract(decompressABI(contractAbi), '0x0000000000000000000000000000000000000000');
        assert.notEqual(contract.methods.testMethod, undefined, 'Contract ABI was not set');
    }
    

}


// A registered node attempting to join as a member due to low DAO member count
export async function setDaoNodeTrustedMemberRequired(_id, _url, txOptions) {

    // Load contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const rocketVault = await RocketVault.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONodeTrusted.getMemberCount.call(),
            rocketTokenRPL.balanceOf(txOptions.from),
            rocketVault.balanceOfToken('rocketDAONodeTrustedActions', rocketTokenRPL.address),
        ]).then(
            ([memberTotal, rplBalanceBond, rplBalanceVault]) =>
            ({memberTotal, rplBalanceBond, rplBalanceVault})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    //console.log('Member Total', Number(ds1.memberTotal), web3.utils.fromWei(ds1.rplBalanceBond), web3.utils.fromWei(ds1.rplBalanceVault));

    // Add a new proposal
    await rocketDAONodeTrusted.memberJoinRequired(_id, _url, txOptions);

    // Capture data
    let ds2 = await getTxData();
    //console.log('Member Total', Number(ds2.memberTotal), web3.utils.fromWei(ds2.rplBalanceBond), web3.utils.fromWei(ds2.rplBalanceVault));

    // Check member count has increased
    assert(ds2.memberTotal.eq(ds1.memberTotal.add(web3.utils.toBN(1))), 'Member count has not increased');
    assert(ds2.rplBalanceVault.eq(ds1.rplBalanceVault.add(ds1.rplBalanceBond)), 'RocketVault address does not contain the correct RPL bond amount');
}
