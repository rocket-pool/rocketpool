// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketPool = artifacts.require('./contract/RocketPool');

// Get user minipools
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 1) done('Incorrect number of arguments. Please enter: user address.');
    if (!Web3.utils.isAddress(args[0])) done('User address is invalid.');

    // Parse arguments
    let [userAddress] = args;

    // Get contract dependencies
    const rocketPool = await RocketPool.deployed();

    // Get minipool addresses
    let poolAddresses = await rocketPool.getPoolsFilterWithUserDeposit(userAddress);

    // Output minipool addresses
    done(poolAddresses);

};

