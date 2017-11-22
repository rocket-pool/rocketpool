// Config
var config = require("../truffle.js");

// Contacts
var rocketStorage = artifacts.require("./RocketStorage.sol");
var rocketPool = artifacts.require("./RocketPool.sol");
var rocketUser = artifacts.require("./RocketUser.sol");
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


module.exports = async function (deployer, network) {
    // Deploy libraries
    deployer.deploy(arithmeticLib, rocketSettingsInterface, rocketStorageInterface).then(function () {
        // Lib Links
        deployer.link(arithmeticLib, [rocketUser, rocketPoolMiniDelegate, rocketDepositToken]);
        // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
        return deployer.deploy(rocketStorage).then(function () {
            // Deploy casper dummy contract
            return deployer.deploy(dummyCasper).then(function () {
                // Seed Casper with some funds to cover the rewards + deposit sent back
                web3.eth.sendTransaction({ from: accounts[0], to: dummyCasper.address, value: web3.toWei('6', 'ether'), gas: 1000000 });
                // Deploy Rocket User
                return deployer.deploy(rocketUser, rocketStorage.address).then(function () {
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
                                                // Update the storage with the new addresses
                                                return rocketStorage.deployed().then(async function (rocketStorageInstance) {
                                                    console.log("\n");

                                                   
                                                    // Rocket Pool
                                                    // First register the contract address as being part of the network so we can do a validation check using just the address
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketPool.address), rocketPool.address);
                                                    // Now register again that contracts name so we can retrieve it by name if needed
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketPool"), rocketPool.address);
                                                    // Log it
                                                    console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPool Address');
                                                    console.log(rocketPool.address);  

                                                    // Rocket User
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketUser.address), rocketUser.address);
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketUser"), rocketUser.address);
                                                    // Log it
                                                    console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUser Address');
                                                    console.log(rocketUser.address);  

                                                    // Rocket Node
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketNode.address), rocketNode.address);
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketNode"), rocketNode.address);
                                                    // Log it
                                                    console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketNode Address');
                                                    console.log(rocketNode.address);  

                                                    // Rocket Pool Mini Delegate
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketPoolMiniDelegate.address), rocketPoolMiniDelegate.address);
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketPoolMiniDelegate"), rocketPoolMiniDelegate.address);
                                                    // Log it
                                                    console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPoolMiniDelegate Address');
                                                    console.log(rocketPoolMiniDelegate.address);  

                                                    // Rocket Factory
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketFactory.address), rocketFactory.address);
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketFactory"), rocketFactory.address);
                                                    // Log it
                                                    console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketFactory Address');
                                                    console.log(rocketFactory.address);

                                                    // Rocket Partner API
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketPartnerAPI.address), rocketPartnerAPI.address);
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketPartnerAPI"), rocketPartnerAPI.address);
                                                    // Log it
                                                    console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPartnerAPI Address');
                                                    console.log(rocketPartnerAPI.address);

                                                    // Rocket Deposit Token
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketDepositToken.address), rocketDepositToken.address);
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketDepositToken"), rocketDepositToken.address);
                                                    // Log it
                                                    console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketDepositToken Address');
                                                    console.log(rocketDepositToken.address);

                                                    // Rocket Settings
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", rocketSettings.address), rocketSettings.address);
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "rocketSettings"), rocketSettings.address);
                                                    // Log it
                                                    console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketSettings Address');
                                                    console.log(rocketSettings.address);  

                                                    // Dummy Casper 
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.address", dummyCasper.address), dummyCasper.address);
                                                    await rocketStorageInstance.setAddress(config.web3Utils.soliditySha3("contract.name", "dummyCasper"), dummyCasper.address);
                                                    // Log it
                                                    console.log('\x1b[33m%s\x1b[0m:', 'Set Storage DummyCasper Address');
                                                    console.log(dummyCasper.address);

                                                    // Disable owners direct access to storage now
                                                    await rocketStorageInstance.setBool(config.web3Utils.soliditySha3("contract.storage.initialised"), true);
                                                    // Log it
                                                    console.log('\x1b[33m%s\x1b[0m:', 'Set Storage Owner Access Removed');
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
};
