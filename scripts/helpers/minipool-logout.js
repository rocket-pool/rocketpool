// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketNodeValidator = artifacts.require('./contract/RocketNodeValidator');

// Logout minipool
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 3) done('Incorrect number of arguments. Please enter: node address, minipool address, logout message.');
    if (!Web3.utils.isAddress(args[0])) done('Node address is invalid.');
    if (!Web3.utils.isAddress(args[1])) done('Minipool address is invalid.');

    // Parse arguments
    let [nodeAddress, miniPoolAddress, logoutMessage] = args;

    // Get contract dependencies
    const rocketNodeValidator = await RocketNodeValidator.deployed();

    // Logout
    let result = await rocketNodeValidator.minipoolLogout(miniPoolAddress, logoutMessage.toString('hex'), {from: nodeAddress, gas: 1600000});

    // Complete
    done('Minipool successfully logged out: ' + args.join(', '));

};

