// Dependencies
const Web3 = require('web3');

// Artifacts
const CasperValidation = artifacts.require('./contract/Casper/Validation');
const RocketNode = artifacts.require('./contract/RocketNode');

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
    const rocketNode = await RocketNode.deployed();

    // Create and sign validation contract for node
    const valCodeContract = await CasperValidation.new({from: nodeAddress, gas: 500000, gasPrice: 10000000000});
    const signature = web3.eth.sign(nodeAddress, Web3.utils.soliditySha3(valCodeContract.address));

    // Register node
    let result = await rocketNode.nodeAdd(nodeAddress, providerID, subnetID, instanceID, regionID, valCodeContract.address, signature, {from: web3.eth.coinbase, gas: 1600000});

    // Complete
    done('Node successfully registered: ' + args.join(', '));

};

