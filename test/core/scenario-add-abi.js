import { RocketStorage, RocketUpgrade } from '../_utils/artifacts';
import { compressABI, decompressABI } from '../_utils/contract';


// Add a new network contract ABI
export async function addABI(name, abi, txOptions) {

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

    // Upgrade ABI
    await rocketUpgrade.addABI(name, compressedAbi, txOptions);

    // Get & check ABI
    let contractAbi = await rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', name));
    let contract = new web3.eth.Contract(decompressABI(contractAbi), '0x0000000000000000000000000000000000000000');
    assert.notEqual(contract.methods.testMethod, undefined, 'Contract ABI was not set');

}

