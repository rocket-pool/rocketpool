// Global injected objects
global.artifacts = artifacts;
global.web3 = web3;

// Dependencies
const Web3 = require('web3');
const casperEpochIncrementAmount = require('../../test/_lib/casper/casper.js').casperEpochIncrementAmount;

// Increment Casper epoch
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 2) done('Incorrect number of arguments. Please enter: from address, increment amount.');
    if (!Web3.utils.isAddress(args[0])) done('From address is invalid.');

    // Parse arguments
    let [fromAddress, incrementAmount] = args;

    // Increment
    await casperEpochIncrementAmount(fromAddress, incrementAmount);

    // Complete
    done('Casper epochs successfully incremented: ' + args.join(', '));

};

