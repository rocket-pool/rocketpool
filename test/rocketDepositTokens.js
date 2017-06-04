var rocketHub = artifacts.require("./contract/RocketHub.sol");
var rocketPool = artifacts.require("./contract/RocketPool.sol");
var rocketDepositToken = artifacts.require("./contract/RocketDepositToken.sol");

var displayEvents = false;

// Display events triggered during the tests
if(displayEvents) {
    rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
        var eventWatch = rocketDepositTokenInstance.allEvents({
            fromBlock: 0,
            toBlock: 'latest',
        }).watch(function (error, result) {
            // Print the event to console
            var printEvent = function(type, result, colour) {
                console.log("\n");
                console.log(colour, '*** '+type.toUpperCase()+' EVENT: ' + result.event + ' *******************************');
                console.log("\n");
                console.log(result.args);
                console.log("\n");
            }
            // This will catch all events, regardless of how they originated.
            if (error == null) {
                // Print the event
                printEvent('rocket', result, '\x1b[33m%s\x1b[0m:');
            }
        });
    });
}


contract('RocketDepositToken', function (accounts) {

    var owner = accounts[0];
    var userFirst = accounts[1];
    var userFirstTokens = 10;
    var userSecond = accounts[2];
    var userThird = accounts[2];

    
    /*
    it("seed the deposit token contract with some funds to to simulate pool deposits which have had tokens withdrawn out against them", function () {
        rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
            web3.eth.sendTransaction({ from: accounts[9], to: rocketDepositTokenInstance.address, value: web3.toWei('50', 'ether'), gas: 1000000 });
            return true;
        }).then(function (result) {
             assert.isTrue(result, "successfully seed deposit token contract with ether");
        });
    });*/

    it("fail to mint tokens - not Rocket Pool", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // RocketDepositToken now
            return rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
                // Transaction
                return rocketDepositTokenInstance.mint(userFirst, userFirstTokens, { from:userFirst, gas: 150000 }).then(function (result) {
                    return result;
                }).then(function(result) {
                    assert(false, "Expect throw but didn't.");
                    }).catch(function (error) {
                    if(error.toString().indexOf("VM Exception") == -1) {
                        // Didn't throw like we expected
                        assert(false, error.toString());
                    } 
                    // Always show out of gas errors
                    if(error.toString().indexOf("out of gas") != -1) {
                        assert(false, error.toString());
                    }
                });
            });
        });    
    }); // End Test  


    it(userFirst+" - userFist send ether to RP, creates a new minipool", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Get the min ether required to launch a mini pool
                    return rocketSettingsInstance.getPoolMinEtherRequired.call().then(function (result) {
                        // Transaction - Send Ether as a user, send enough not to trigger the pool to enter countdown status for launch
                        var sendAmount = web3.toWei('5', 'ether'); 
                        return rocketPoolInstance.sendTransaction({ from: userSecond, to: rocketPoolInstance.address, value: sendAmount, gas: rocketDepositGas }).then(function(result) {
                            // Now check the events
                            var userSendAmount = 0;
                            var userSendAddress = 0;
                            var userCount = 0;
                            var poolAddress = 0;
                            var poolStatus = null;
                            var poolBalance = 0;
                            for(var i=0; i < result.logs.length; i++) {
                                if(result.logs[i].event == 'Transferred') {
                                    userSendAmount = result.logs[i].args.value;
                                    userSendAddress = result.logs[i].args._from;
                                    poolAddress = result.logs[i].args._to;
                                }
                            };
                            // Get the instance the prev mini pool
                            var miniPoolInstance = rocketPoolMini.at(poolAddress);
                            return miniPoolFirstInstance.getStatus.call().then(function (result) {
                                poolStatus = result.valueOf();
                                poolBalance = web3.eth.getBalance(miniPoolInstance.address).valueOf();
                                // Now just count the users to make sure this user wasn't added twice
                                return miniPoolInstance.getUserCount.call().then(function (result) {
                                    userCount = result.valueOf();
                                    // Now check everything
                                    if(userSendAmount == sendAmount && poolStatus == 1 && poolBalance > sendAmount && userCount == 2) {
                                        return true;
                                    }
                                    return false;
                                }).then(function (result) {
                                    assert.isTrue(result, "Funds transferred successfully, mini pool moved to countdown status, user balance updated.");
                                }); 
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test
    


   
});


 


