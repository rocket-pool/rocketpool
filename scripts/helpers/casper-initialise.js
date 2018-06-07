// Global injected objects
global.artifacts = artifacts;
global.web3 = web3;

// Dependencies
const casperEpochInitialise = require('../../test/_lib/casper/casper.js').casperEpochInitialise;

// Initialise Casper epoch - ensures internal state is valid
module.exports = async (done) => {

    // Initialise
    await casperEpochInitialise(web3.eth.coinbase);

    // Complete
    done('Casper successfully initialised.');

};

