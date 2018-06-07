// Global injected objects
global.artifacts = artifacts;
global.web3 = web3;

// Dependencies
const casperEpochInitialise = require('../../test/_lib/casper/casper.js').casperEpochInitialise;

// Initialise Casper epoch on a loop - ensures internal state is valid
module.exports = async (done) => {

    // Initialise on interval
    setInterval(initialise, 3000);
    initialise();

};

// Initialise
async function initialise() {
	await casperEpochInitialise(web3.eth.coinbase);
	console.log('Epoch initialised.');
}

