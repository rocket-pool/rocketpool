import { RocketStorage, RocketUpgrade } from '../_utils/artifacts';
import { compressABI, decompressABI } from '../_utils/contract';


// Add a new network contract
export async function addContract(name, address, abi, txOptions) {

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

    // Add contract
    await rocketUpgrade.addContract(name, address, compressedAbi, txOptions);

    // Get updated contract data
    let contractData = await getContractData();
    let contractAddressData = await getContractAddressData(contractData.address);

    // Initialise new contract from stored data
    let contract = new web3.eth.Contract(decompressABI(contractData.abi), contractData.address);

    // Check contract details
    assert.equal(contractData.address, address, 'Contract address was not set');
    assert.notEqual(contract.methods.testMethod, undefined, 'Contract ABI was not set');
    assert.isTrue(contractAddressData.exists, 'New contract exists flag was not set');
    assert.notEqual(contractAddressData.name, '', 'New contract name was not set');

}

