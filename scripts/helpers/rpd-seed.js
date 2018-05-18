// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketDepositToken = artifacts.require('./contract/RocketDepositToken');

// Seed RPD contract
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 2) done('Incorrect number of arguments. Please enter: from address, seed amount (ETH).');
    if (!Web3.utils.isAddress(args[0])) done('From address is invalid.');
    if (isNaN(args[1])) done('Seed amount (ETH) is invalid.');

    // Parse arguments
    let [fromAddress, seedAmountEth] = args;

    // Get contract dependencies
    const rocketDepositToken = await RocketDepositToken.deployed();

    // Seed contract
    await web3.eth.sendTransaction({
        from: fromAddress,
        to: rocketDepositToken.address,
        value: Web3.utils.toWei(seedAmountEth, 'ether'),
        gas: 500000,
    });

    // Complete
    done('RPD contract seeded successfully: ' + args.join(', '));

};

