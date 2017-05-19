// Contacts
var rocketHub = artifacts.require("./RocketHub.sol");
var rocketPool = artifacts.require("./RocketPool.sol");
var rocketFactory = artifacts.require("./RocketFactory.sol");
var rocketSettings = artifacts.require("./RocketSettings.sol");
var dummyCasper = artifacts.require("./contract/casper/DummyCasper.sol");
// Libs
var arithmeticLib = artifacts.require("./lib/Arithmetic.sol");
// Accounts
var accounts = web3.eth.accounts;

module.exports = function (deployer, network) {
    // Deploy rockethub first - has to be done in this order so that the following contracts already know the hub address
    deployer.deploy(arithmeticLib).then(function () {
        // Lib Links
        deployer.link(arithmeticLib, rocketPool);
        // Deploy rockethub first - has to be done in this order so that the following contracts already know the hub address
        return deployer.deploy(rocketHub).then(function () {
            // Deploy casper dummy contract
            return deployer.deploy(dummyCasper).then(function () {
                // Seed Casper with some funds to cover the rewards + deposit sent back
                web3.eth.sendTransaction({ from: accounts[9], to: dummyCasper.address, value: web3.toWei('10', 'ether'), gas: 1000000 });
                // Deploy rocket factory
                return deployer.deploy(rocketFactory, rocketHub.address).then(function () {
                    // Deploy rocket settings
                    return deployer.deploy(rocketSettings, rocketHub.address).then(function () {
                        // Deploy the main rocket pool
                        return deployer.deploy(rocketPool, rocketHub.address).then(function () {
                            // Update the hub with the new addresses
                            rocketHub.deployed().then(function (rocketHubInstance) {
                                console.log("\n");
                                // Set rocket pool
                                rocketHubInstance.setRocketPoolAddress(rocketPool.address);
                                console.log('\x1b[33m%s\x1b[0m:', 'Updated Hub RocketPool Address');
                                console.log(rocketPool.address);
                                // Set rocket factory
                                rocketHubInstance.setRocketFactoryAddress(rocketFactory.address);
                                console.log('\x1b[33m%s\x1b[0m:', 'Updated Hub RocketFactory Address');
                                console.log(rocketFactory.address);
                                // Set rocket settings
                                rocketHubInstance.setRocketSettingsAddress(rocketSettings.address);
                                console.log('\x1b[33m%s\x1b[0m:', 'Updated Hub RocketSettings Address');
                                console.log(rocketSettings.address);
                                // Set casper address
                                rocketHubInstance.setCasperAddress(dummyCasper.address);
                                console.log('\x1b[33m%s\x1b[0m:', 'Updated Dummy Casper Address');
                                console.log(dummyCasper.address);
                                return deployer;
                            });
                        });
                    });
                });
            });
        });
    });
};


