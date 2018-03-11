// Config
const config = require('../truffle.js');

// Contacts
const rocketStorage = artifacts.require('./RocketStorage.sol');
const rocketRole = artifacts.require('./RocketRole.sol');
const rocketPool = artifacts.require('./RocketPool.sol');
const rocketUser = artifacts.require('./RocketUser.sol');
const rocketNode = artifacts.require('./RocketNode.sol');
const rocketPoolMiniDelegate = artifacts.require('./RocketPoolMiniDelegate.sol');
const rocketDepositToken = artifacts.require('./RocketDepositToken.sol');
const rocketPartnerAPI = artifacts.require('./RocketPartnerAPI.sol');
const rocketSettings = artifacts.require('./RocketSettings.sol');
const rocketFactory = artifacts.require('./RocketFactory.sol');
const rocketUpgrade = artifacts.require('./RocketUpgrade.sol');
const rocketUtils = artifacts.require('./RocketUtils.sol');
const dummyCasper = artifacts.require('./contract/casper/DummyCasper.sol');

// Interfaces
const rocketStorageInterface = artifacts.require('./contracts/interface/RocketStorageInterface.sol');
const rocketSettingsInterface = artifacts.require('./contracts/interface/RocketSettingsInterface.sol');

// Accounts
const accounts = web3.eth.accounts;

module.exports = async (deployer, network) => {
    // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
    return deployer.deploy(rocketStorage).then(() => {
      // Deploy casper dummy contract
      return deployer.deploy(dummyCasper).then(() => {
        // Seed Casper with some funds to cover the rewards + deposit sent back
        web3.eth.sendTransaction({
          from: accounts[0],
          to: dummyCasper.address,
          value: web3.toWei('6', 'ether'),
          gas: 1000000,
        });
        // Deploy Rocket Utils
        return deployer.deploy(rocketUtils, rocketStorage.address).then(() => {
          // Deploy Rocket Upgrade
          return deployer.deploy(rocketUpgrade, rocketStorage.address).then(() => {
            // Deploy Rocket Role
            return deployer.deploy(rocketRole, rocketStorage.address).then(() => {
              // Deploy Rocket User
              return deployer.deploy(rocketUser, rocketStorage.address).then(() => {
                // Deploy rocket 3rd party partner API
                return deployer.deploy(rocketPartnerAPI, rocketStorage.address).then(() => {
                  // Deploy rocket deposit token
                  return deployer.deploy(rocketDepositToken, rocketStorage.address).then(() => {
                    // Deploy rocket factory
                    return deployer.deploy(rocketFactory, rocketStorage.address).then(() => {
                      // Deploy rocket settings
                      return deployer.deploy(rocketSettings, rocketStorage.address).then(() => {
                        // Deploy the main rocket pool
                        return deployer.deploy(rocketPool, rocketStorage.address).then(() => {
                          // Deploy the rocket node
                          return deployer.deploy(rocketNode, rocketStorage.address).then(() => {
                            // Deploy the rocket pool mini delegate
                            return deployer.deploy(rocketPoolMiniDelegate, rocketStorage.address).then(() => {
                              // Update the storage with the new addresses
                              return rocketStorage.deployed().then(async rocketStorageInstance => {
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
                                  rocketUser.address
                                );
                                // Log it
                                console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUser Address');
                                console.log(rocketUser.address);

                                // Rocket User
                                await rocketStorageInstance.setAddress(
                                  config.web3.utils.soliditySha3('contract.address', rocketUser.address),
                                  rocketUser.address
                                );
                                await rocketStorageInstance.setAddress(
                                  config.web3.utils.soliditySha3('contract.name', 'rocketUser'),
                                  rocketUser.address
                                );
                                // Log it
                                console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUser Address');
                                console.log(rocketUser.address);

                                // Rocket Node
                                await rocketStorageInstance.setAddress(
                                  config.web3.utils.soliditySha3('contract.address', rocketNode.address),
                                  rocketNode.address
                                );
                                await rocketStorageInstance.setAddress(
                                  config.web3.utils.soliditySha3('contract.name', 'rocketNode'),
                                  rocketNode.address
                                );
                                // Log it
                                console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketNode Address');
                                console.log(rocketNode.address);

                                // Rocket Pool Mini Delegate
                                await rocketStorageInstance.setAddress(
                                  config.web3.utils.soliditySha3('contract.address', rocketPoolMiniDelegate.address),
                                  rocketPoolMiniDelegate.address
                                );
                                await rocketStorageInstance.setAddress(
                                  config.web3.utils.soliditySha3('contract.name', 'rocketPoolMiniDelegate'),
                                  rocketPoolMiniDelegate.address
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
                                // Log it
                                console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketDepositToken Address');
                                console.log(rocketDepositToken.address);

                                // Rocket Settings
                                await rocketStorageInstance.setAddress(
                                  config.web3.utils.soliditySha3('contract.address', rocketSettings.address),
                                  rocketSettings.address
                                );
                                await rocketStorageInstance.setAddress(
                                  config.web3.utils.soliditySha3('contract.name', 'rocketSettings'),
                                  rocketSettings.address
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
                                // Return
                                return deployer;
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
};
