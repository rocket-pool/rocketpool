// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketNodeStatus = artifacts.require('./contract/RocketNodeStatus');

// Checkin node
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 2) done('Incorrect number of arguments. Please enter: node address, average load.');
    if (!Web3.utils.isAddress(args[0])) done('Node address is invalid.');

    // Parse arguments
    let [nodeAddress, averageLoad] = args;

    // Get contract dependencies
    const rocketNodeStatus = await RocketNodeStatus.deployed();

    // Estimate gas required to check in
    let gasEstimate = await rocketNodeStatus.nodeCheckin.estimateGas(averageLoad, {from: nodeAddress});

    // Check in
    let result = await rocketNodeStatus.nodeCheckin(averageLoad, {from: nodeAddress, gas: parseInt(gasEstimate) + 100000});

    // Complete
    done('Node successfully checked in: ' + args.join(', '));

};

