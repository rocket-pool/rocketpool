/*** Dependencies ********************/
const pako = require('pako');


/*** Settings ************************/
const config = require('../truffle.js');


/*** Contracts ***********************/
// Storage
const rocketStorage = artifacts.require('./RocketStorage.sol');
// All other contracts
const contracts = {};
// Core
contracts.rocketPool = artifacts.require('./RocketPool.sol');
contracts.rocketRole = artifacts.require('./RocketRole.sol');
// API
contracts.rocketDepositAPI = artifacts.require('./api/RocketDepositAPI.sol');
contracts.rocketHelpersAPI = artifacts.require('./api/RocketHelpersAPI.sol');
// Settings
contracts.rocketAPISettings = artifacts.require('./settings/RocketAPISettings.sol');

/*
// Utilities
contracts.addressListStorage = artifacts.require('./AddressListStorage.sol');
contracts.boolListStorage = artifacts.require('./BoolListStorage.sol');
contracts.bytesListStorage = artifacts.require('./BytesListStorage.sol');
contracts.intListStorage = artifacts.require('./IntListStorage.sol');
contracts.stringListStorage = artifacts.require('./StringListStorage.sol');
contracts.uintListStorage = artifacts.require('./UintListStorage.sol');
*/


/*** Utility Methods *****************/
// Compress / decompress ABIs
function compressABI(abi) {
  return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}
function decompressABI(abi) {
  return JSON.parse(pako.inflate(Buffer.from(abi, 'base64'), {to: 'string'}));
}
// Load ABI files and parse
function loadABI(abiFilePath) {
  return JSON.parse(config.fs.readFileSync(abiFilePath));
}
// Build the deployment array
function buildDeployment(obj, storageAddress) {
  let buildArray = [];
  for (let item in obj) {
    if( obj.hasOwnProperty(item) ) {
      buildArray.push([obj[item], storageAddress]);
    } 
  } 
  return buildArray;     
}

// Accounts
const accounts = web3.eth.accounts;


// Start exporting now
module.exports = async (deployer, network) => {

  // Set our web3 1.0 provider
  let $web3;
  if ( network !== 'live' ) {
    const providerUrl = `http://${config.networks[network].host}:${config.networks[network].port}`;
    console.log(`Web3 1.0 provider using ${providerUrl}`);
    $web3 = new config.web3(providerUrl);
  }

  return deployer

    // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
    .deploy(rocketStorage)

    // Deploy other contracts
    .then(() => {
      return deployer.deploy(
        // Build deployment array - contracts
        buildDeployment(contracts, rocketStorage.address)
      );
    })

    // Post-deployment actions
    .then(async () => {      

      // Update the storage with the new addresses
      let rocketStorageInstance = await rocketStorage.deployed();
      console.log('\n');
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage Address');
      console.log(rocketStorage.address);

      // Register all other contracts with storage and store their abi
      for (let contract in contracts) {
        if(contracts.hasOwnProperty(contract)) {
          // Log it
          console.log('\x1b[33m%s\x1b[0m:', 'Set Storage '+contract+' Address');
          console.log(contracts[contract].address);
          // First register the contract address as being part of the network so we can do a validation check using just the address
          await rocketStorageInstance.setAddress(
            config.web3.utils.soliditySha3('contract.address', contracts[contract].address),
            contracts[contract].address
          );
          // Now register again that contracts name so we can retrieve it by name if needed
          await rocketStorageInstance.setAddress(
            config.web3.utils.soliditySha3('contract.name', contract),
            contracts[contract].address
          );
          // Compress and store the ABI
          await rocketStorageInstance.setString(
            config.web3.utils.soliditySha3('contract.abi', contract),
            compressABI(contracts[contract].abi)
          );
        } 
      } 
    
      /*** Permissions ********/
      
      // Disable direct access to storage now
      await rocketStorageInstance.setBool(
        config.web3.utils.soliditySha3('contract.storage.initialised'),
        true
      );
      // Log it
      console.log('\x1b[32m%s\x1b[0m', 'Post - Storage Direct Access Removed');

    });

};

