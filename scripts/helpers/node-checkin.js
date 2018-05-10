// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketNode = artifacts.require('./contract/RocketNode');

// Register node
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 2) done('Incorrect number of arguments. Please enter: node address, average load.');
    if (!Web3.utils.isAddress(args[0])) done('Node address is invalid.');

    // Parse arguments
    let [nodeAddress, averageLoad] = args;

    // Get contract dependencies
    const rocketNode = await RocketNode.deployed();

    // Estimate gas required to check in
    let gasEstimate = await rocketNode.nodeCheckin.estimateGas(averageLoad, {from: nodeAddress});

    // Check in
    let result = await rocketNode.nodeCheckin(averageLoad, {from: nodeAddress, gas: parseInt(gasEstimate) + 100000});

    // Complete
    done('Node successfully checked in: ' + args.join(', '));

};

