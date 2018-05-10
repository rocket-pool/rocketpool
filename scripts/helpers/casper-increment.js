// Dependencies
const Web3 = require('web3');

// Artifacts
const Casper = artifacts.require('./contract/DummyCasper');

// Increment Casper epoch / dynasty
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 1) done('Incorrect number of arguments. Please enter: "epoch" or "dynasty".');
    if (args[0] != 'epoch' && args[0] != 'dynasty') done('Increment type is invalid.');

    // Parse arguments
    let [type] = args;

    // Get contract dependencies
    const casper = await Casper.deployed();

    // Increment
    await casper['set_increment_' + type]({from: web3.eth.coinbase});

    // Complete
    done('Casper successfully incremented: ' + args.join(', '));

};

