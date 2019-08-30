// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketDepositAPI = artifacts.require('./contract/api/RocketDepositAPI');

// Perform user deposit
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 4) done('Incorrect number of arguments. Please enter: group address, user address, deposit amount (ETH), staking time ID.');
    if (!Web3.utils.isAddress(args[0])) done('Group address is invalid.');
    if (!Web3.utils.isAddress(args[1])) done('User address is invalid.');
    if (isNaN(args[2])) done('Deposit amount (ETH) is invalid.');
    if (args[3] != '3m' && args[3] != '6m' && args[3] != '12m') done('Staking time ID is invalid.');

    // Parse arguments
    let [groupAddress, userAddress, depositAmountEth, stakingTimeID] = args;

    // Get contract dependencies
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Perform deposit
    try {

        // Deposit
        let gasEstimate = await rocketDepositAPI.deposit.estimateGas(groupAddress, userAddress, stakingTimeID, {
            from: userAddress,
            value: Web3.utils.toWei(depositAmountEth, 'ether'),
        });
        let result = await rocketDepositAPI.deposit(groupAddress, userAddress, stakingTimeID, {
            from: userAddress,
            value: Web3.utils.toWei(depositAmountEth, 'ether'),
            gas: gasEstimate + 20000,
        });

        // Complete
        done('Deposit made successfully: ' + args.join(', '));

    }

    // Log errors
    catch (err) {
        console.log(err.message);
    }

};

