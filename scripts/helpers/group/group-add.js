// Dependencies
const Web3 = require('web3');

// Artifacts
const RocketGroup = artifacts.require('./contract/RocketGroup');

module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

      // Validate arguments
    if (args.length != 3) done('Incorrect number of arguments. Please enter: group ID, name, fee.');
    if (isNaN(args[2])) done('Fee amount (ETH) is invalid.');

    // Parse arguments
    let [groupId, name, fee] = args;

    // Get contract dependencies
    const rocketGroup = await RocketGroup.deployed();

    // Perform add group
    let result = await rocketGroup.add(groupId, name, Web3.utils.toWei(fee, 'ether'), {
        from: web3.eth.coinbase,
        gas: 480000,
    });

    // Show events
    console.log('********************************');
    result.logs.forEach(event => {
        console.log(event['event'], event['args']);
    });;
    console.log('********************************');

    // Complete
    done('Group added successfully: ' + args.join(', '));
   

};

