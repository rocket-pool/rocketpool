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
contracts.rocketGroup = artifacts.require('./RocketGroup.sol');
contracts.rocketRole = artifacts.require('./RocketRole.sol');
contracts.rocketPIP = artifacts.require('./RocketPIP.sol');
// API
contracts.rocketDepositAPI = artifacts.require('./api/RocketDepositAPI.sol');
contracts.rocketHelpersAPI = artifacts.require('./api/RocketHelpersAPI.sol');
// Settings
contracts.rocketAPISettings = artifacts.require('./settings/RocketAPISettings.sol');
contracts.rocketGroupSettings = artifacts.require('./settings/RocketGroupSettings.sol');
contracts.rocketMinipoolSettings = artifacts.require('./settings/RocketMinipoolSettings.sol');
// Utilities
contracts.utilMaths = artifacts.require('./utils/Maths.sol');
contracts.utilAddressListStorage = artifacts.require('./AddressListStorage.sol');
contracts.utilBoolListStorage = artifacts.require('./BoolListStorage.sol');
contracts.utilBytesListStorage = artifacts.require('./BytesListStorage.sol');
contracts.utilIntListStorage = artifacts.require('./IntListStorage.sol');
contracts.utilStringListStorage = artifacts.require('./StringListStorage.sol');
contracts.utilUintListStorage = artifacts.require('./UintListStorage.sol');


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


// Start exporting now
module.exports = async (deployer, network) => {

  // Set our web3 1.0 provider
  let $web3;
  if ( network !== 'live' ) {
    const providerUrl = `http://${config.networks[network].host}:${config.networks[network].port}`;
    console.log(`Web3 1.0 provider using ${providerUrl}`);
    $web3 = new config.web3(providerUrl);
  }

  // Accounts
  const accounts = await web3.eth.getAccounts();

  // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
  await deployer.deploy(rocketStorage);
  // Update the storage with the new addresses
  let rocketStorageInstance = await rocketStorage.deployed();
  // Deploy other contracts - have to be inside an async loop
  const deployContracts = async function() {
    for (let contract in contracts) {
      await deployer.deploy(contracts[contract], rocketStorage.address);
    }
  };
  // Run it
  await deployContracts();
  // Add them to RocketStorage
  console.log('\n');
  // Register all other contracts with storage and store their abi
  const addContracts = async function() {
    for (let contract in contracts) {
      if(contracts.hasOwnProperty(contract)) {
        // Utilities do not need write access to storage
        if(!contract.startsWith("util")){
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
    }
  };
  // Run it
  await addContracts();
  // Disable direct access to storage now
  await rocketStorageInstance.setBool(
    config.web3.utils.soliditySha3('contract.storage.initialised'),
    true
  );
  // Log it
  console.log('\n');
  console.log('\x1b[32m%s\x1b[0m', 'Post - Storage Direct Access Removed');

};

