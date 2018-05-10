// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketPool = artifacts.require('./contract/RocketPool');

// Register node
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 2) done('Incorrect number of arguments. Please enter: minipool address, staking duration.');
    if (!Web3.utils.isAddress(args[0])) done('Minipool address is invalid.');

    // Parse arguments
    let [miniPoolAddress, stakingDuration] = args;

    // Get contract dependencies
    const rocketPool = await RocketPool.deployed();

    // Set staking duration
    await rocketPool.setPoolStakingDuration(miniPoolAddress, stakingDuration, {from: web3.eth.coinbase, gas: 150000});

    // Complete
    done('Minipool staking duration set successfully: ' + args.join(', '));

};

