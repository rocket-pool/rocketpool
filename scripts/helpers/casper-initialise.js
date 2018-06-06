// Global injected objects
global.artifacts = artifacts;
global.web3 = web3;

// Dependencies
const Web3 = require('web3');
const casperEpochInitialise = require('../../test/_lib/casper/casper.js').casperEpochInitialise;

// Checkin node
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 1) done('Incorrect number of arguments. Please enter: from address.');
    if (!Web3.utils.isAddress(args[0])) done('From address is invalid.');

    // Parse arguments
    let [fromAddress] = args;

    // Initialise
    await casperEpochInitialise(fromAddress);

    // Complete
    done('Casper successfully initialised.');

};

