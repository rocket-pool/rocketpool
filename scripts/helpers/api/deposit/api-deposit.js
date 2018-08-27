// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketDepositAPI = artifacts.require('./contract/api/RocketDepositAPI');

// Perform user deposit
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 3) done('Incorrect number of arguments. Please enter: user address, deposit amount (ETH), staking time ID.');
    if (!Web3.utils.isAddress(args[0])) done('User address is invalid.');
    if (isNaN(args[1])) done('Deposit amount (ETH) is invalid.');
    if (args[2] != '3m' && args[2] != '6m' && args[2] != '9m' && args[2] != '12m') done('Staking time ID is invalid.');

    // Parse arguments
    let [userAddress, depositAmountEth, stakingTimeID] = args;

    // Get contract dependencies
    const rocketUser = await RocketUser.deployed();

    // Perform user deposit
    let result = await rocketUser.userDeposit(stakingTimeID, {
        from: userAddress,
        value: Web3.utils.toWei(depositAmountEth, 'ether'),
        gas: 4800000,
    });

    // Complete
    done('User deposit made successfully: ' + args.join(', '));

};

