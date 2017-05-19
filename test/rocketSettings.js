var rocketHub = artifacts.require("./contract/RocketHub.sol");
var rocketPool = artifacts.require("./contract/RocketPool.sol");
var rocketPoolMini = artifacts.require("./contract/RocketPoolMini.sol");
var rocketSettings = artifacts.require("./contract/RocketSettings.sol");


contract('RocketSettings', function (accounts) {

    var owner = accounts[0];
    var testUser = accounts[1];
    
    // Get the default pool staking time ID
    it("Get default mini pool staking time ID and make sure it matches the deployed default", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   poolMiniMinimumStakingTime
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                return rocketSettingsInstance.getPoolMiniMinimumStakingTime.call().then(function (result) {
                    var minStakingTimeDeployed = result.valueOf();
                    return rocketSettingsInstance.getPoolStakingTime.call(web3.sha3('default')).then(function (result) {
                        var minStakingTimeDefault = result.valueOf();
                        // Test now
                        return minStakingTimeDeployed == minStakingTimeDefault ? true : false;
                    }).then(function (result) {
                        assert.isTrue(result, "Current default pool staking time matches deployed default staking time.");
                    });
                });
            });
        });
    });


    // Set a new default staking time
    it("Set a new default mini pool staking time longer than the current default", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   poolMiniMinimumStakingTime
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                return rocketSettingsInstance.getPoolMiniMinimumStakingTime.call().then(function (result) {
                    var minStakingTimeDeployed = result.valueOf();
                    // Set the default time to +100 seconds
                    return rocketSettingsInstance.setPoolStakingTime(web3.sha3('default'), (minStakingTimeDeployed+100), {from: owner, gas: 150000}).then(function (result) {
                        return rocketSettingsInstance.getPoolStakingTime.call(web3.sha3('default')).then(function (result) {
                            var minStakingTimeDefault = result.valueOf();                           
                            // Test now
                            return minStakingTimeDefault == (minStakingTimeDeployed+100) ? true : false;
                        });
                     }).then(function (result) {
                        assert.isTrue(result, "Current default pool staking time is great than deployed default staking time.");
                    });
                });
            });
        });
    });
   
});


 


