// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketGroupAPI = artifacts.require('./contract/api/RocketGroupAPI');
const RocketGroupSettings = artifacts.require('./contract/settings/RocketGroupSettings');

module.exports = async (done) => {

    const accounts = await web3.eth.getAccounts();

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

      // Validate arguments
    if (args.length != 2) done('Incorrect number of arguments. Please enter: name, fee.');
    if (isNaN(args[1])) done('Fee amount (ETH) is invalid.');

    // Parse arguments
    let [name, fee] = args;

    // Get contract dependencies
    const rocketGroupAPI = await RocketGroupAPI.deployed();
    const rocketGroupSettings = await RocketGroupSettings.deployed();

    try {
        // See if the group registration requires a fee?
        let feeRequired = await rocketGroupSettings.getNewFee();
        let gasEstimate = await rocketGroupAPI.add.estimateGas(name, Web3.utils.toWei(fee, 'ether'), {
            from: accounts[0],
            value: feeRequired
        })
        // Perform add group
        let result = await rocketGroupAPI.add(name, Web3.utils.toWei(fee, 'ether'), {
            from: accounts[0],
            gas: gasEstimate,
            value: feeRequired
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
        done('Group added successfully: ' + args.join(', '));
      } catch (err) {
        console.log(err.message);
      }

};

