// Config
const config = require('../truffle.js');

// Contacts
const RocketStorage = artifacts.require('./RocketStorage.sol');
const RocketRole = artifacts.require('./RocketRole.sol');
const RocketPool = artifacts.require('./RocketPool.sol');
const RocketUser = artifacts.require('./RocketUser.sol');
const RocketNode = artifacts.require('./RocketNode.sol');
const RocketPoolMiniDelegate = artifacts.require('./RocketPoolMiniDelegate.sol');
const RocketDepositToken = artifacts.require('./RocketDepositToken.sol');
const RocketPartnerAPI = artifacts.require('./RocketPartnerAPI.sol');
const RocketVault = artifacts.require('./RocketVault.sol');
const RocketSettings = artifacts.require('./RocketSettings.sol');
const RocketFactory = artifacts.require('./RocketFactory.sol');
const RocketUpgrade = artifacts.require('./RocketUpgrade.sol');
const RocketUtils = artifacts.require('./RocketUtils.sol');
const DummyCasper = artifacts.require('./contract/casper/DummyCasper.sol');

// Interfaces
const RocketStorageInterface = artifacts.require('./contracts/interface/RocketStorageInterface.sol');
const RocketSettingsInterface = artifacts.require('./contracts/interface/RocketSettingsInterface.sol');

// Accounts
const accounts = web3.eth.accounts;

module.exports = async (deployer, network) => {
  // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
  await deployer.deploy(RocketStorage);
  // Deploy casper dummy contract
  await deployer.deploy(DummyCasper);

  // Seed Casper with some funds to cover the rewards + deposit sent back
  web3.eth.sendTransaction({
    from: accounts[0],
    to: DummyCasper.address,
    value: web3.toWei('6', 'ether'),
    gas: 1000000,
  });
  
  // Deploy Rocket Vault
  await deployer.deploy(RocketVault, RocketStorage.address);
  // Deploy Rocket Utils
  await deployer.deploy(RocketUtils, RocketStorage.address);
  // Deploy Rocket Upgrade
  await deployer.deploy(RocketUpgrade, RocketStorage.address);
  // Deploy Rocket Role
  await deployer.deploy(RocketRole, RocketStorage.address);
  // Deploy Rocket User
  await deployer.deploy(RocketUser, RocketStorage.address);
  // Deploy rocket 3rd party partner API
  await deployer.deploy(RocketPartnerAPI, RocketStorage.address);
  // Deploy rocket deposit token
  await deployer.deploy(RocketDepositToken, RocketStorage.address);
  // Deploy rocket factory
  await deployer.deploy(RocketFactory, RocketStorage.address);
  // Deploy rocket settings
  await deployer.deploy(RocketSettings, RocketStorage.address);
  // Deploy the main rocket pool
  await deployer.deploy(RocketPool, RocketStorage.address);
  // Deploy the rocket node
  await deployer.deploy(RocketNode, RocketStorage.address);
  // Deploy the rocket pool mini delegate
  await deployer.deploy(RocketPoolMiniDelegate, RocketStorage.address);
  // Update the storage with the new addresses
  const rocketStorage = await RocketStorage.deployed();
  console.log('\n');

  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage Address');
  console.log(RocketStorage.address);

  // Dummy Casper
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', DummyCasper.address),
    DummyCasper.address
  );
  await rocketStorage.setAddress(config.web3.utils.soliditySha3('contract.name', 'casper'), DummyCasper.address);
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage DummyCasper Address');
  console.log(DummyCasper.address);

  // Rocket Pool
  // First register the contract address as being part of the network so we can do a validation check using just the address
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketPool.address),
    RocketPool.address
  );
  // Now register again that contracts name so we can retrieve it by name if needed
  await rocketStorage.setAddress(config.web3.utils.soliditySha3('contract.name', 'rocketPool'), RocketPool.address);
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPool Address');
  console.log(RocketPool.address);

  // Rocket Role
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketRole.address),
    RocketRole.address
  );
  await rocketStorage.setAddress(config.web3.utils.soliditySha3('contract.name', 'rocketRole'), RocketRole.address);
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketRole Address');
  console.log(RocketRole.address);

  // Rocket User
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketUser.address),
    RocketUser.address
  );
  await rocketStorage.setAddress(config.web3.utils.soliditySha3('contract.name', 'rocketUser'), RocketUser.address);
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUser Address');
  console.log(RocketUser.address);

  // Rocket Node
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketNode.address),
    RocketNode.address
  );
  await rocketStorage.setAddress(config.web3.utils.soliditySha3('contract.name', 'rocketNode'), RocketNode.address);
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketNode Address');
  console.log(RocketNode.address);

  // Rocket Pool Mini Delegate
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketPoolMiniDelegate.address),
    RocketPoolMiniDelegate.address
  );
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.name', 'rocketPoolMiniDelegate'),
    RocketPoolMiniDelegate.address
  );
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPoolMiniDelegate Address');
  console.log(RocketPoolMiniDelegate.address);

  // Rocket Factory
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketFactory.address),
    RocketFactory.address
  );
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.name', 'rocketFactory'),
    RocketFactory.address
  );
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketFactory Address');
  console.log(RocketFactory.address);

  // Rocket Upgrade
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketUpgrade.address),
    RocketUpgrade.address
  );
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.name', 'rocketUpgrade'),
    RocketUpgrade.address
  );
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUpgrade Address');
  console.log(RocketUpgrade.address);

  // Rocket Utils
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketUtils.address),
    RocketUtils.address
  );
  await rocketStorage.setAddress(config.web3.utils.soliditySha3('contract.name', 'rocketUtils'), RocketUtils.address);
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUtils Address');
  console.log(RocketUtils.address);

  // Rocket Partner API
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketPartnerAPI.address),
    RocketPartnerAPI.address
  );
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.name', 'rocketPartnerAPI'),
    RocketPartnerAPI.address
  );
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPartnerAPI Address');
  console.log(RocketPartnerAPI.address);

  // Rocket Deposit Token
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketDepositToken.address),
    RocketDepositToken.address
  );
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.name', 'rocketDepositToken'),
    RocketDepositToken.address
  );
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketDepositToken Address');
  console.log(RocketDepositToken.address);

  // Rocket Pool Token
  // TODO: Update to correct address after RPL token contract created
  await rocketStorage.setAddress(config.web3.utils.soliditySha3('contract.name', 'rocketPoolToken'), RocketDepositToken.address);
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPoolToken Address');
  console.log(RocketDepositToken.address);

  // Rocket Vault
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketVault.address),
    RocketVault.address
  );
  await rocketStorage.setAddress(config.web3.utils.soliditySha3('contract.name', 'rocketVault'), RocketVault.address);
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketVault Address');
  console.log(RocketVault.address);
  console.log('\n');

  // Rocket Settings
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.address', RocketSettings.address),
    RocketSettings.address
  );
  await rocketStorage.setAddress(
    config.web3.utils.soliditySha3('contract.name', 'rocketSettings'),
    RocketSettings.address
  );
  // Log it
  console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketSettings Address');
  console.log(RocketSettings.address);
  console.log('\n');

  /*** Initialise **********/
  const rocketSettings = await RocketSettings.deployed();
  await rocketSettings.init();

  console.log('\x1b[32m%s\x1b[0m', 'Post - Settings Initialised');

  /*** Permissions *********/

  // Disable direct access to storage now
  await rocketStorage.setBool(config.web3.utils.soliditySha3('contract.storage.initialised'), true);
  // Log it
  console.log('\x1b[32m%s\x1b[0m', 'Post - Storage Direct Access Removed');
  // Return
  return deployer;
};
