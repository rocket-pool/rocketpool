// Config
const config = require('../truffle.js');

// Contacts
const rocketStorage = artifacts.require('./RocketStorage.sol');
const rocketRole = artifacts.require('./RocketRole.sol');
const rocketPool = artifacts.require('./RocketPool.sol');
const rocketUser = artifacts.require('./RocketUser.sol');
const rocketNodeAdmin = artifacts.require('./RocketNodeAdmin.sol');
const rocketNodeValidator = artifacts.require('./contracts/RocketNodeValidator.sol');
const rocketNodeStatus = artifacts.require('./contracts/RocketNodeStatus.sol');
const rocketPoolMiniDelegate = artifacts.require('./RocketPoolMiniDelegate.sol');
const rocketDepositToken = artifacts.require('./RocketDepositToken.sol');
const rocketPartnerAPI = artifacts.require('./RocketPartnerAPI.sol');
const rocketVault = artifacts.require('./RocketVault.sol');
const rocketVaultStore = artifacts.require('./RocketVaultStore.sol');
const rocketSettings = artifacts.require('./RocketSettings.sol');
const rocketFactory = artifacts.require('./RocketFactory.sol');
const rocketUpgrade = artifacts.require('./RocketUpgrade.sol');
const rocketUtils = artifacts.require('./RocketUtils.sol');
const rocketPoolTokenDummy = artifacts.require('./contract/DummyRocketPoolToken.sol');
const dummyCasper = artifacts.require('./contract/casper/DummyCasper.sol');

// Interfaces
const rocketStorageInterface = artifacts.require('./contracts/interface/RocketStorageInterface.sol');
const rocketSettingsInterface = artifacts.require('./contracts/interface/RocketSettingsInterface.sol');

// Accounts
const accounts = web3.eth.accounts;

module.exports = async (deployer, network) => {
  return deployer

    // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
    .deploy(rocketStorage)

    // Deploy other contracts
    .then(() => {
      return deployer.deploy([
        // Deploy casper dummy contract
        dummyCasper,
        // Deploy Rocket Vault
        [rocketVault, rocketStorage.address],
        // Deploy Rocket Vault Store
        [rocketVaultStore, rocketStorage.address],
        // Deploy Rocket Utils
        [rocketUtils, rocketStorage.address],
        // Deploy Rocket Upgrade
        [rocketUpgrade, rocketStorage.address],
        // Deploy Rocket Role
        [rocketRole, rocketStorage.address],
        // Deploy Rocket User
        [rocketUser, rocketStorage.address],
        // Deploy rocket 3rd party partner API
        [rocketPartnerAPI, rocketStorage.address],
        // Deploy rocket deposit token
        [rocketDepositToken, rocketStorage.address],
        // Deploy rocket factory
        [rocketFactory, rocketStorage.address],
        // Deploy rocket settings
        [rocketSettings, rocketStorage.address],
        // Deploy the main rocket pool
        [rocketPool, rocketStorage.address],
        // Deploy the rocket node admin
        [rocketNodeAdmin, rocketStorage.address],
        // Deploy the rocket node validator
        [rocketNodeValidator, rocketStorage.address],
        // Deploy the rocket node status
        [rocketNodeStatus, rocketStorage.address],
        // Deploy the rocket pool mini delegate
        [rocketPoolMiniDelegate, rocketStorage.address],
        // Deploy dummy RPL Token contract for testing
        rocketPoolTokenDummy,
      ]);
    })

    // Post-deployment actions
    .then(async () => {

      // Seed Casper with some funds to cover the rewards + deposit sent back
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: dummyCasper.address,
        value: web3.toWei('6', 'ether'),
        gas: 1000000,
      });

      // Update the storage with the new addresses
      let rocketStorageInstance = await rocketStorage.deployed();
      console.log('\n');

      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage Address');
      console.log(rocketStorage.address);

      // Dummy Casper
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', dummyCasper.address),
        dummyCasper.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'casper'),
        dummyCasper.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'casper'),
        JSON.stringify(dummyCasper.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage DummyCasper Address');
      console.log(dummyCasper.address);

      // Rocket Pool
      // First register the contract address as being part of the network so we can do a validation check using just the address
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketPool.address),
        rocketPool.address
      );
      // Now register again that contracts name so we can retrieve it by name if needed
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketPool'),
        rocketPool.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketPool'),
        JSON.stringify(rocketPool.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPool Address');
      console.log(rocketPool.address);

      // Rocket Role
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketRole.address),
        rocketRole.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketRole'),
        rocketRole.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketRole'),
        JSON.stringify(rocketRole.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketRole Address');
      console.log(rocketRole.address);

      // Rocket User
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketUser.address),
        rocketUser.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketUser'),
        rocketUser.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketUser'),
        JSON.stringify(rocketUser.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUser Address');
      console.log(rocketUser.address);

      // Rocket Node Admin
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketNodeAdmin.address),
        rocketNodeAdmin.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketNodeAdmin'),
        rocketNodeAdmin.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketNodeAdmin'),
        JSON.stringify(rocketNodeAdmin.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketNodeAdmin Address');
      console.log(rocketNodeAdmin.address);

      // Rocket Node Validator
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketNodeValidator.address),
        rocketNodeValidator.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketNodeValidator'),
        rocketNodeValidator.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketNodeValidator'),
        JSON.stringify(rocketNodeValidator.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketNodeValidator Address');
      console.log(rocketNodeValidator.address);

      // Rocket Node Status
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketNodeStatus.address),
        rocketNodeStatus.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketNodeStatus'),
        rocketNodeStatus.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketNodeStatus'),
        JSON.stringify(rocketNodeStatus.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketNodeStatus Address');
      console.log(rocketNodeStatus.address);

      // Rocket Pool Mini Delegate
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketPoolMiniDelegate.address),
        rocketPoolMiniDelegate.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketPoolMiniDelegate'),
        rocketPoolMiniDelegate.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketPoolMiniDelegate'),
        JSON.stringify(rocketPoolMiniDelegate.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPoolMiniDelegate Address');
      console.log(rocketPoolMiniDelegate.address);

      // Rocket Factory
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketFactory.address),
        rocketFactory.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketFactory'),
        rocketFactory.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketFactory'),
        JSON.stringify(rocketFactory.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketFactory Address');
      console.log(rocketFactory.address);

      // Rocket Upgrade
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketUpgrade.address),
        rocketUpgrade.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketUpgrade'),
        rocketUpgrade.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketUpgrade'),
        JSON.stringify(rocketUpgrade.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUpgrade Address');
      console.log(rocketUpgrade.address);

      // Rocket Utils
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketUtils.address),
        rocketUtils.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketUtils'),
        rocketUtils.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketUtils'),
        JSON.stringify(rocketUtils.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUtils Address');
      console.log(rocketUtils.address);

      // Rocket Partner API
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketPartnerAPI.address),
        rocketPartnerAPI.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketPartnerAPI'),
        rocketPartnerAPI.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketPartnerAPI'),
        JSON.stringify(rocketPartnerAPI.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPartnerAPI Address');
      console.log(rocketPartnerAPI.address);

      // Rocket Deposit Token
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketDepositToken.address),
        rocketDepositToken.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketDepositToken'),
        rocketDepositToken.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketDepositToken'),
        JSON.stringify(rocketDepositToken.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketDepositToken Address');
      console.log(rocketDepositToken.address);

      // Rocket Pool Token
      await rocketStorageInstance.setAddress(
        // If we are migrating to live mainnet, set the token address for the current live RPL contract
        config.web3.utils.soliditySha3('contract.name', 'rocketPoolToken'),
        network == 'live' ? '0xb4efd85c19999d84251304bda99e90b92300bd93' : rocketPoolTokenDummy.address
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPoolToken Address');
      console.log(rocketPoolTokenDummy.address);

      // Rocket Vault
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketVault.address),
        rocketVault.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketVault'),
        rocketVault.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketVault'),
        JSON.stringify(rocketVault.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketVault Address');
      console.log(rocketVault.address);

      // Rocket Vault Store
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketVaultStore.address),
        rocketVaultStore.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketVaultStore'),
        rocketVaultStore.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketVaultStore'),
        JSON.stringify(rocketVaultStore.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage rocketVaultStore Address');
      console.log(rocketVaultStore.address);

      // Rocket Settings
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketSettings.address),
        rocketSettings.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketSettings'),
        rocketSettings.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketSettings'),
        JSON.stringify(rocketSettings.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketSettings Address');
      console.log(rocketSettings.address);
      console.log('\n');                                  

      /*** Initialise **********/
      const rocketSettingsInstance = await rocketSettings.deployed();
      await rocketSettingsInstance.init();

      console.log('\x1b[32m%s\x1b[0m', 'Post - Settings Initialised');

      /*** Permissions *********/
      
      // Disable direct access to storage now
      await rocketStorageInstance.setBool(
        config.web3.utils.soliditySha3('contract.storage.initialised'),
        true
      );
      // Log it
      console.log('\x1b[32m%s\x1b[0m', 'Post - Storage Direct Access Removed');

    });

};

