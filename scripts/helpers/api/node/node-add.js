// Dependencies
const Web3 = require('web3');
const BN = require('bn.js');

// Artifacts
const RocketNodeAPI = artifacts.require('./contract/api/RocketNodeAPI');
const RocketNodeSettings = artifacts.require('./contract/settings/RocketNodeSettings');

module.exports = async (done) => {

    const accounts = await web3.eth.getAccounts();

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 1) done('Incorrect number of arguments. Please enter: timezone.');
    //if (isNaN(args[1])) done('Fee amount (ETH) is invalid.');

    // Parse arguments
    let [timezone] = args;


    try {
        // Get contract dependencies
        const rocketNodeAPI = await RocketNodeAPI.deployed();
        const rocketNodeSettings = await RocketNodeSettings.deployed();

        // See if the group registration requires a fee?
        let gasEstimate = await rocketNodeAPI.add.estimateGas(timezone, {
            from: accounts[0]
        })
        // Perform add group
        let result = await rocketNodeAPI.add(timezone, {
            from: accounts[0],
            gas: gasEstimate
        });
        // Show events
        result.logs.forEach(event => {
            console.log('********************************');
            console.log('EVENT: '+event['event'], );
            console.log('********************************');
            Object.keys(event['args']).forEach(arg => {
                console.log(' - '+arg+': ', BN.isBN(event['args'][arg].valueOf()) ? new BN(event['args'][arg].valueOf(), 18).toString() : event['args'][arg].valueOf());
            });
        });;
        console.log('********************************');
        // Complete
        console.log('Gas estimate: '+gasEstimate);
        done('Node added successfully: ' + args.join(', '));
      } catch (err) {
        console.log(err.message);
      }

};

