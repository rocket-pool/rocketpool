// Artifacts
const ValidatorRegistration = artifacts.require('./ValidatorRegistration');

// Register validator
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 4) done('Incorrect number of arguments. Please enter: validator public key, withdrawal shard ID, withdrawal address, randao commitment.');
    if (isNaN(args[1])) done('Withdrawal shard ID is invalid.');
    if (!web3.utils.isAddress(args[2])) done('Withdrawal address is invalid.');

    // Parse arguments
    let [pubKey, withdrawalShardID, withdrawalAddress, randaoCommitment] = args;

    // Get accounts
    const accounts = await web3.eth.getAccounts();
    const owner = accounts[0];

    // Get contract dependencies
    const validatorRegistration = await ValidatorRegistration.deployed();

    // Register
    try {

        // Send deposit tx
        let result = await validatorRegistration.deposit(pubKey, withdrawalShardID, withdrawalAddress, randaoCommitment, {from: owner, value: web3.utils.toWei('32', 'ether'), gas: 500000});

        // Log event
        console.log('ValidatorRegistered event:', result.logs[0]);

        // Success
        done('Validator registered successfully.');

    }
    catch (err) {
        console.log('Validator registration error:', err.message);
    }

};
