// Config
var config = require("../truffle.js");

// Contacts
var rocketHub = artifacts.require("./RocketHub.sol");
var rocketStorage = artifacts.require("./RocketStorage.sol");
var rocketPool = artifacts.require("./RocketPool.sol");
var rocketNode = artifacts.require("./RocketNode.sol");
var rocketPoolMiniDelegate = artifacts.require("./RocketPoolMiniDelegate.sol");
var rocketDepositToken = artifacts.require("./RocketDepositToken.sol");
var rocketPartnerAPI = artifacts.require("./RocketPartnerAPI.sol");
var rocketSettings = artifacts.require("./RocketSettings.sol");
var rocketFactory = artifacts.require("./RocketFactory.sol");
var dummyCasper = artifacts.require("./contract/casper/DummyCasper.sol");

// Interfaces
var rocketStorageInterface = artifacts.require("./contracts/interface/RocketStorageInterface.sol");
var rocketSettingsInterface = artifacts.require("./contracts/interface/RocketSettingsInterface.sol");

// Libs
var arithmeticLib = artifacts.require("./lib/Arithmetic.sol");

// Accounts
var accounts = web3.eth.accounts;

// TODO: Optimise this using the simpler deploy option
module.exports = function (deployer, network) {
    // Deploy libraries
    deployer.deploy(arithmeticLib, rocketSettingsInterface, rocketStorageInterface).then(function () {
        // Lib Links
        deployer.link(arithmeticLib, [rocketPool, rocketPoolMiniDelegate, rocketDepositToken]);
        // Deploy rockethub first - has to be done in this order so that the following contracts already know the hub address
        return deployer.deploy(rocketStorage).then(function () {
            // Deploy rockethub first - has to be done in this order so that the following contracts already know the hub address
            return deployer.deploy(rocketHub).then(function () {
                // Deploy casper dummy contract
                return deployer.deploy(dummyCasper).then(function () {
                    // Seed Casper with some funds to cover the rewards + deposit sent back
                    web3.eth.sendTransaction({ from: accounts[0], to: dummyCasper.address, value: web3.toWei('6', 'ether'), gas: 1000000 });
                    // Deploy rocket 3rd party partner API
                    return deployer.deploy(rocketPartnerAPI, rocketStorage.address).then(function () {
                        // Deploy rocket deposit token
                        return deployer.deploy(rocketDepositToken, rocketStorage.address).then(function () {
                            // Deploy rocket factory
                            return deployer.deploy(rocketFactory, rocketStorage.address).then(function () {
                                // Deploy rocket settings
                                return deployer.deploy(rocketSettings, rocketStorage.address).then(function () {
                                    // Deploy the main rocket pool
                                    return deployer.deploy(rocketPool, rocketStorage.address).then(function () {
                                        // Deploy the rocket node
                                        return deployer.deploy(rocketNode, rocketStorage.address).then(function () {
                                            // Deploy the rocket pool mini delegate
                                            return deployer.deploy(rocketPoolMiniDelegate, rocketStorage.address).then(function () {
                                                // Update the hub with the new addresses
                                                return rocketHub.deployed().then(function (rocketHubInstance) {
                                                     // Update the storage with the new addresses
                                                     return rocketStorage.deployed().then(function (rocketStorageInstance) {
                                                            console.log("\n");
  
                                                            // Rocket Pool
                                                            // First register the contract address as being part of the network so we can do a validation check using just the address
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketPool.address), rocketPool.address);
                                                            // Now register again that contracts name so we can retrieve it by name if needed
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketPool"), rocketPool.address);
                                                            // Log it
                                                            console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPool Address');
                                                            console.log(rocketPool.address);  

                                                            // Rocket Node
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketNode.address), rocketNode.address);
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketNode"), rocketNode.address);
                                                            // Log it
                                                            console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketNode Address');
                                                            console.log(rocketNode.address);  

                                                            // Rocket Pool Mini Delegate
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketPoolMiniDelegate.address), rocketPoolMiniDelegate.address);
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketPoolMiniDelegate"), rocketPoolMiniDelegate.address);
                                                            // Log it
                                                            console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPoolMiniDelegate Address');
                                                            console.log(rocketPoolMiniDelegate.address);  

                                                            // Rocket Factory
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketFactory.address), rocketFactory.address);
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketFactory"), rocketFactory.address);
                                                            // Log it
                                                            console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketFactory Address');
                                                            console.log(rocketFactory.address);

                                                            // Rocket Partner API
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketPartnerAPI.address), rocketPartnerAPI.address);
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketPartnerAPI"), rocketPartnerAPI.address);
                                                            // Log it
                                                            console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPartnerAPI Address');
                                                            console.log(rocketPartnerAPI.address);

                                                            // Rocket Deposit Token
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketDepositToken.address), rocketDepositToken.address);
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketPartnerAPI"), rocketDepositToken.address);
                                                            // Log it
                                                            console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketDepositToken Address');
                                                            console.log(rocketDepositToken.address);

                                                            // Rocket Settings
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketSettings.address), rocketSettings.address);
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketSettings"), rocketSettings.address);
                                                            // Log it
                                                            console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketSettings Address');
                                                            console.log(rocketSettings.address);  

                                                            // Dummy Casper
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", dummyCasper.address), dummyCasper.address);
                                                            rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "dummyCasper"), dummyCasper.address);
                                                            // Log it
                                                            console.log('\x1b[33m%s\x1b[0m:', 'Set Storage DummyCasper Address');
                                                            console.log(dummyCasper.address);
                                  
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
};
