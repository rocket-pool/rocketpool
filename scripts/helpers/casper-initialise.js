// Global injected objects
global.artifacts = artifacts;
global.web3 = web3;

// Dependencies
const Web3 = require('web3');
const casperEpochInitialise = require('../../test/_lib/casper/casper.js').casperEpochInitialise;

// Checkin node
module.exports = async (done) => {

    // Initialise
    await casperEpochInitialise(web3.eth.coinbase);

    // Complete
    done('Casper successfully initialised.');

};

