import { RocketStorage, RocketUpgrade } from '../_utils/artifacts';
import { compressABI, decompressABI } from '../_utils/contract';


// Upgrade a network contract
export async function upgradeContract(name, address, abi, txOptions) {

    // Load contracts
    const [
        rocketStorage,
        rocketUpgrade,
    ] = await Promise.all([
        RocketStorage.deployed(),
        RocketUpgrade.deployed(),
    ]);

    // Add test method to ABI
    let testAbi = abi.slice();
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
    let compressedAbi = compressABI(testAbi);

    // Get contract data
    function getContractData() {
        return Promise.all([
            rocketStorage.getAddress.call(web3.utils.soliditySha3('contract.address', name)),
            rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', name)),
        ]).then(
            ([address, abi]) =>
            ({address, abi})
        );
    }
    function getContractAddressData(contractAddress) {
        return Promise.all([
            rocketStorage.getBool.call(web3.utils.soliditySha3('contract.exists', contractAddress)),
            rocketStorage.getString.call(web3.utils.soliditySha3('contract.name', contractAddress)),
        ]).then(
            ([exists, name]) =>
            ({exists, name})
        );
    }

    // Get initial contract data
    let contract1 = await getContractData();

    // Upgrade contract
    await rocketUpgrade.upgradeContract(name, address, compressedAbi, txOptions);

    // Get updated contract data
    let contract2 = await getContractData();
    let [oldContractData, newContractData] = await Promise.all([
        getContractAddressData(contract1.address),
        getContractAddressData(contract2.address),
    ]);

    // Initialise new contract from stored data
    let newContract = new web3.eth.Contract(decompressABI(contract2.abi), contract2.address);

    // Check contract details
    assert.equal(contract2.address, address, 'Contract address was not successfully upgraded');
    assert.notEqual(newContract.methods.testMethod, undefined, 'Contract ABI was not successfully upgraded');
    assert.isFalse(oldContractData.exists, 'Old contract address exists flag was not unset');
    assert.equal(oldContractData.name, '', 'Old contract address name was not unset');
    assert.isTrue(newContractData.exists, 'New contract exists flag was not set');
    assert.notEqual(newContractData.name, '', 'New contract name was not set');

}

