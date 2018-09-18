// Dependencies
const Web3 = require('web3');
const BN = require('bn.js');

// Artifacts
const RocketRPL = artifacts.require('./contract/token/DummyRocketPoolToken.sol');
const RocketNodeContract = artifacts.require('./contract/nodes/RocketNodeContract');
const RocketNodeSettings = artifacts.require('./contract/settings/RocketNodeSettings');
const RocketMinipool = artifacts.require('./contract/minipool/RocketMinipool');

module.exports = async (done) => {

    const accounts = await web3.eth.getAccounts();

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 1) done('Incorrect number of arguments. Please enter: minipool contract address, rpl amount.');
    if (!Web3.utils.isAddress(args[0])) done('Minipool contract address is invalid.');

    // Parse arguments
    let [minipoolAddress] = args;


    try {
        // Get contract dependencies
        const rocketRPL = await RocketRPL.deployed();
        const rocketMinipool = await RocketMinipool.at(minipoolAddress);
        const rocketNodeContract = await RocketNodeContract.at(await rocketMinipool.getNodeContract({from: accounts[0], gas: 50000}));
        //const rocketNodeSettings = await RocketNodeSettings.deployed();

        // ether & rpl
        let nodeContractEtherBalanceBefore = await web3.eth.getBalance(rocketNodeContract.address);
        let nodeContractRPLBalanceBefore = new BN(await rocketRPL.balanceOf(rocketNodeContract.address)).toString();

        console.log("Node Contract Ether Balance Before: "+nodeContractEtherBalanceBefore);
        console.log("Node Contract RPL Balance Before: "+nodeContractRPLBalanceBefore);

        // close it
        let gasEstimate = await rocketMinipool.nodeCloseMinipool.estimateGas({
            from: accounts[0]
        })
        // Perform RPL miniting
        let result = await rocketMinipool.nodeCloseMinipool({
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

        // ether & rpl
        let nodeContractEtherBalanceAfter = await web3.eth.getBalance(rocketNodeContract.address);
        let nodeContractRPLBalanceAfter = new BN(await rocketRPL.balanceOf(rocketNodeContract.address)).toString();

        console.log("Node Contract Ether Balance After: "+nodeContractEtherBalanceAfter);
        console.log("Node Contract RPL Balance After: "+nodeContractRPLBalanceAfter);
        
        console.log('********************************');
        done('Node minipool close successfull: ' + args.join(', '));
   
      } catch (err) {
        console.log(err.message);
      }

};

