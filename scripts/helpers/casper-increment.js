// Global injected objects
global.artifacts = artifacts;
global.web3 = web3;

// Dependencies
const casperEpochIncrementAmount = require('../../test/_lib/casper/casper.js').casperEpochIncrementAmount;

// Increment Casper epoch
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 1) done('Incorrect number of arguments. Please enter: increment amount.');

    // Parse arguments
    let [incrementAmount] = args;

    // Increment
    await casperEpochIncrementAmount(web3.eth.coinbase, incrementAmount);

    // Complete
    done('Casper epochs successfully incremented: ' + args.join(', '));

};

