// Dependencies
const Web3 = require('web3');
const ethereumUtils = require('ethereumjs-util');
const createValidationCodeContractBytes = require('../../test/_lib/validation-code-contract/validation-code-contract.js').createValidationCodeContractBytes;

// Artifacts
const RocketNodeAdmin = artifacts.require('./contract/RocketNodeAdmin');

// Register node
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 5) done('Incorrect number of arguments. Please enter: node address, provider ID, subnet ID, instance ID, region ID.');
    if (!Web3.utils.isAddress(args[0])) done('Node address is invalid.');

    // Parse arguments
    let [nodeAddress, providerID, subnetID, instanceID, regionID] = args;

    // Get contract dependencies
    const rocketNodeAdmin = await RocketNodeAdmin.deployed();

    // Create validation contract for node
    const validationContractBytes = createValidationCodeContractBytes(nodeAddress);
    const validationContractTxHash = await web3.eth.sendTransaction({
        from: nodeAddress,
        data: validationContractBytes,
        gas: 500000,
    });
    const validationContractReceipt = await web3.eth.getTransactionReceipt(validationContractTxHash);
    const valCodeContractAddress = validationContractReceipt.contractAddress;

    // Sign validation contract
    const signature = web3.eth.sign(nodeAddress, valCodeContractAddress);
    const signatureHash = hashMessage(valCodeContractAddress);

    // Register node
    let result = await rocketNodeAdmin.nodeAdd(nodeAddress, providerID, subnetID, instanceID, regionID, valCodeContractAddress, signatureHash, signature, {from: web3.eth.coinbase, gas: 1600000});

    // Complete
    done('Node successfully registered: ' + args.join(', '));

};


// Hash a message for Casper validation
function hashMessage(data) {
    var message = Web3.utils.isHexStrict(data) ? Web3.utils.hexToBytes(data) : data;
    var messageBuffer = Buffer.from(message);
    var preamble = "\x19Ethereum Signed Message:\n" + message.length;
    var preambleBuffer = Buffer.from(preamble);
    var ethMessage = Buffer.concat([preambleBuffer, messageBuffer]);
    return Web3.utils.bytesToHex(ethereumUtils.sha3(ethMessage));
}

