// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketSettings = artifacts.require('./contract/RocketSettings');

// Update setting
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 2) done('Incorrect number of arguments. Please enter: method name, value.');

    // Parse arguments
    let [methodName, value] = args;

    // Get contract dependencies
    const rocketSettings = await RocketSettings.deployed();

    // Update setting
    await rocketSettings[methodName](value, {from: web3.eth.coinbase, gas: 500000});

    // Complete
    done('Setting successfully updated: ' + args.join(', '));

};

