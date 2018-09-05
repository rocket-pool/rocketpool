// Dependencies
const Web3 = require('web3');
const BN = require('bn.js');

// Artifacts
const RocketRPL = artifacts.require('./contract/token/DummyRocketPoolToken.sol');
const RocketNodeAPI = artifacts.require('./contract/api/RocketNodeAPI');
const RocketNodeContract = artifacts.require('./contract/nodes/RocketNodeContract');
const RocketNodeSettings = artifacts.require('./contract/settings/RocketNodeSettings');

module.exports = async (done) => {

    const accounts = await web3.eth.getAccounts();

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 2) done('Incorrect number of arguments. Please enter: node contract address.');
    if (!Web3.utils.isAddress(args[0])) done('Node contract address is invalid.');
    if (isNaN(args[1])) done('Deposit amount (RPL) is invalid. Check event logs from deposit reservation for amount required.');

    // Parse arguments
    let [nodeContract, rplAmount] = args;


    try {
        // Get contract dependencies
        const rocketRPL = await RocketRPL.deployed();
        const rocketNodeAPI = await RocketNodeAPI.deployed();
        const rocketNodeContract = await RocketNodeContract.at(nodeContract);
        const rocketNodeSettings = await RocketNodeSettings.deployed();

        // ether & rpl
        let depositAmountEther = Web3.utils.toWei('16', 'ether');
        let depositAmountRPL = Web3.utils.toWei(rplAmount, 'ether');

        // mint some RPL for contract
        let gasEstimate = await rocketRPL.mint.estimateGas(nodeContract, depositAmountRPL, {
            from: accounts[0]
        })
        // Perform RPL miniting
        let result = await rocketRPL.mint(nodeContract, depositAmountRPL, {
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
        done('Node contract RPL mint successfull: ' + args.join(', '));
   
      } catch (err) {
        console.log(err.message);
      }

};

