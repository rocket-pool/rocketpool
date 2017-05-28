/*** Built with Truffle 3.2.4  */

var os = require("os");
var rocketHub = artifacts.require("./contract/RocketHub.sol");
var rocketPool = artifacts.require("./contract/RocketPool.sol");
var rocketPoolMini = artifacts.require("./contract/RocketPoolMini.sol");
var rocketPartnerAPI = artifacts.require("./contract/RocketPartnerAPI.sol");
var rocketSettings = artifacts.require("./contract/RocketSettings.sol");
var casper = artifacts.require("./contract/Casper/DummyCasper.sol"); 

var displayEvents = false;

// Display events triggered during the tests
if(displayEvents) {
    rocketPool.deployed().then(function (rocketPoolInstance) {
        var eventWatch = rocketPoolInstance.allEvents({
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
                // Listen for new pool events too
                if (result.event == 'PoolCreated') {
                    // Get an instance of that pool
                    var poolInstance = rocketPoolMini.at(result.args._address);
                    // Watch for events in mini pools also as with the main contract
                    var poolEventWatch = poolInstance.allEvents({
                        fromBlock: 0,
                        toBlock: 'latest',
                    }).watch(function (error, result) {
                        // This will catch all pool events, regardless of how they originated.
                        if (error == null) {
                            printEvent('minipool', result, '\x1b[32m%s\x1b[0m');
                        }
                    });
                }
            }
        });
    });
}



contract('RocketPool', function (accounts) {
    
    // The owner
    var owner = web3.eth.coinbase;
    // RocketPool
    // Deposit gas has to cover potential mini pool contract creation, will often be much cheaper
    var rocketDepositGas = 3000000; 
    var rocketWithdrawalGas = 1450000;
    // Node accounts and gas settings
    var nodeFirst = accounts[8];
    var nodeFirstOracleID = 'aws';
    var nodeFirstInstanceID = 'i-1234567890abcdef5';
    var nodeSecond = accounts[9];
    var nodeSecondOracleID = 'rackspace';
    var nodeSecondInstanceID = '4325';    
    var nodeRegisterGas = 500000;
    var nodeCheckinGas = 950000;
    // Bytes -Set the node validation code (EVM bytecode, serving as a sort of public key that will be used to verify blocks and other consensus messages signed by it - just an example below)
    // (converted to Bytes32 until Solidity allows passing of variable length types (bytes, string) between contracts - https://github.com/ethereum/EIPs/pull/211 )
    var nodeFirstValidationCode = web3.sha3('PUSH1 0 CALLDATALOAD SLOAD NOT PUSH1 9 JUMPI STOP JUMPDEST PUSH1 32 CALLDATALOAD PUSH1 0 CALLDATALOAD SSTORE');
    // Bytes32 - Node value provided for the casper deposit function should be the result of computing a long chain of hashes (TODO: this will need work in the future when its defined better)
    var nodeFirstRandao = '0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658';
    // User accounts
    var userFirst = accounts[1];
    var userSecond = accounts[2];
    var userSecondBackupAddress = accounts[4];
    var userThird = accounts[3];
    // Partner accounts (not real)
    var partnerFirst = accounts[5];
    var partnerFirstName = 'Coinbase';
    var partnerFirstUserAccount = accounts[6];
    var partnerSecond = accounts[7];
    var partnerSecondName = 'MEW';
    var partnerRegisterGas = 200000;
    // Mini Pools
    var miniPoolFirstInstance;

    // Try to register a node as a non rocket pool owner 
    it("fail to register a node - non owner", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // RocketPool now
            return rocketPool.deployed().then(function (rocketPoolInstance) {
                // Transaction
                return rocketPoolInstance.nodeRegister(nodeFirst, nodeFirstOracleID, nodeFirstInstanceID, { from:userFirst, gas: nodeRegisterGas }).then(function (result) {
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
    
    
    // Register 2 nodes
    it("register 2 nodes - owner", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // RocketPool now
            return rocketPool.deployed().then(function (rocketPoolInstance) {
                // Transaction
                return rocketPoolInstance.nodeRegister(nodeFirst, nodeFirstOracleID, nodeFirstInstanceID,  { from: web3.eth.coinbase, gas: nodeRegisterGas }).then(function (result) {
                    // Transaction
                    return rocketPoolInstance.nodeRegister(nodeSecond, nodeSecondOracleID, nodeSecondInstanceID, { from: web3.eth.coinbase, gas: nodeRegisterGas }).then(function (result) {
                        // Now get the total with a call
                        return rocketHubInstance.getRocketNodeCount.call();
                    }).then(function (result) {
                        assert.equal(result.valueOf(), 2, "2 Nodes registered successfully by owner");
                    });
                });
            });
        });    
    }); // End Test

    // Try to register a new partner as a non rocket pool owner 
    it("fail to register a partner - non owner", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // RocketPool api now
            return rocketPartnerAPI.deployed().then(function (rocketPartnerAPIInstance) {
                // Transaction
                return rocketPartnerAPIInstance.partnerRegister(partnerFirst, partnerFirstName, { from: userFirst, gas: partnerRegisterGas }).then(function (result) {
                    return result;
                }).then(function(result) {
                    assert(false, "Expect throw but didn't.");
                }).catch(function(error) {
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


    // Register two 3rd party partners
    it("register 2 partners - owner", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // RocketPool api now
            return rocketPartnerAPI.deployed().then(function (rocketPartnerAPIInstance) {
                // Transaction
                return rocketPartnerAPIInstance.partnerRegister(partnerFirst, partnerFirstName, { from: web3.eth.coinbase, gas: partnerRegisterGas }).then(function (result) {
                    // Transaction
                    return rocketPartnerAPIInstance.partnerRegister(partnerSecond, partnerSecondName, { from: web3.eth.coinbase, gas: partnerRegisterGas }).then(function (result) {
                        // Now get the total with a call
                        return rocketHubInstance.getRocketNodeCount.call();
                    }).then(function (result) {
                        assert.equal(result.valueOf(), 2, "2 Nodes registered successfully by owner");
                    });
                });
            });
        });    
    }); // End Test

   

    // Attempt to make a deposit with an unregistered 3rd party partner 
    it("fail to deposit with an unregistered partner", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // RocketPool api now
                    return rocketPartnerAPI.deployed().then(function (rocketPartnerAPIInstance) {
                        // Get the min ether required to launch a mini pool
                        return rocketSettingsInstance.getPoolMinEtherRequired.call().then(function (result) {
                            // Transaction - Send Ether as a user, but send just enough to create the pool, but not launch it
                            var sendAmount = result.valueOf() - web3.toWei('1', 'ether');
                            // Deposit on a behalf of the partner and also specify the pool staking time ID
                            return rocketPartnerAPIInstance.APIpartnerDeposit(userThird, web3.sha3('default'), { from: userFirst, value: sendAmount, gas: rocketDepositGas }).then(function (result) {
                                return result;
                            }).then(function (result) {
                                assert(false, "Expect throw but didn't.");
                            }).catch(function (error) {
                                if (error.toString().indexOf("VM Exception") == -1) {
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
                });   
            });
        });    
    }); // End Test 

 

    // Attempt to make a deposit with an incorrect pool staking time ID 
    it("fail to deposit with an incorrect pool staking time ID", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // RocketPool api now
                    return rocketPartnerAPI.deployed().then(function (rocketPartnerAPIInstance) {
                        // Get the min ether required to launch a mini pool
                        return rocketSettingsInstance.getPoolMinEtherRequired.call().then(function (result) {
                            // Transaction - Send Ether as a user, but send just enough to create the pool, but not launch it
                            var sendAmount = result.valueOf() - web3.toWei('1', 'ether');
                            // Deposit on a behalf of the partner and also specify a incorrect pool staking time ID
                            return rocketPartnerAPIInstance.APIpartnerDeposit(partnerFirstUserAccount, web3.sha3('beer'), { from: partnerFirst, value: sendAmount, gas: rocketDepositGas }).then(function (result) {
                                return result;
                            }).then(function (result) {
                                assert(false, "Expect throw but didn't.");
                            }).catch(function (error) {
                                if (error.toString().indexOf("VM Exception") == -1) {
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
                });   
            });
        });    
    }); // End Test 


    // Send Ether to Rocket pool with just less than the min amount required to launch a mini pool with no specified 3rd party user partner
    it(userFirst+" - user send ether to RP, create first mini pool, register user with pool", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Get the min ether required to launch a mini pool
                    return rocketSettingsInstance.getPoolMinEtherRequired.call().then(function (result) {
                        // Transaction - Send Ether as a user, but send just enough to create the pool, but not launch it
                        var sendAmount = result.valueOf() - web3.toWei('2', 'ether'); 
                        return rocketPoolInstance.sendTransaction({ from: userFirst, to: rocketPoolInstance.address, value: sendAmount, gas: rocketDepositGas }).then(function(result) {
                            // Now check the events
                            var poolAddress = 0;
                            var poolCreated = false;
                            var poolStatus = null;
                            var poolBalance = 0;
                            var userRegistered = false;
                            var userPartnerAddress = 0;
                            for(var i=0; i < result.logs.length; i++) {
                                if(result.logs[i].event == 'PoolCreated') {
                                    poolCreated = true;
                                    poolAddress = result.logs[i].args._address;
                                }
                                if(result.logs[i].event == 'UserAddedToPool') {
                                    userRegistered = true;
                                    userPartnerAddress = result.logs[i].args._partnerAddress;
                                 };
                            };
                             // Get an instance of that pool and do further checks
                            miniPoolFirstInstance = rocketPoolMini.at(poolAddress);
                            return miniPoolFirstInstance.getStatus.call().then(function (result) {
                                // Status = 0? The default
                                poolStatus = result.valueOf();
                                poolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                                // Now check everything
                                if(poolCreated == true && poolStatus == 0 && poolBalance == sendAmount && userRegistered == true && userPartnerAddress == 0) {
                                    return true;
                                }
                                return false;
                            }).then(function (result) {
                                assert.isTrue(result, "Funds transferred successfully, mini pool created, user reg and funds Transferred to mini pool.");
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test



    // Have the same initial user send an deposit again, to trigger the pool to go into countdown
    it(userFirst+" - user send ether to RP from same user again, their balance updates, first mini pool remains accepting deposits and only 1 reg user", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Get the min ether required to launch a mini pool
                    return rocketSettingsInstance.getPoolMinEtherRequired.call().then(function (result) {
                        // Transaction - Send Ether as a user, send enough not to trigger the pool to enter countdown status for launch
                        var minDepositRequiredForLaunch = result.valueOf();
                        var sendAmount = web3.toWei('1', 'ether'); 
                        return rocketPoolInstance.sendTransaction({ from: userFirst, to: rocketPoolInstance.address, value: sendAmount, gas: rocketDepositGas }).then(function(result) {
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
                                    // Now get the user
                                    return miniPoolInstance.getUser.call(userFirst).then(function (result) {
                                        var user = result.valueOf();
                                        var userBalance = result[1].valueOf();                                        
                                        // Now check everything
                                        if(userSendAmount == sendAmount && poolStatus == 0 && poolBalance > sendAmount && userCount == 1 && (minDepositRequiredForLaunch - web3.toWei('1', 'ether') == userBalance)) {
                                            return true;
                                        }
                                        return false;
                                    }).then(function (result) {
                                        assert.isTrue(result, "Funds transferred successfully, mini pool remains accepting deposits, user balance updated.");
                                    });
                                }) 
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test

    
    // Have a new user send an deposit, to trigger the pool to go into countdown
    it(userSecond+" - user send ether to RP from a new user, first mini pool status changes to countdown and only 2 reg users", function () {
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

    // Second user sets a backup withdrawal address
    it(userSecond + " - registers a backup withdrawal address on their deposit while minipool is in countdown", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Now set the backup address
                    rocketPoolInstance.userSetWithdrawalDepositAddress(userSecondBackupAddress, miniPoolFirstInstance.address, { from: userSecond, gas: 550000 }).then(function (result) {
                        var newBackupAddress = 0;
                        // Check the event log now
                        for(var i=0; i < result.logs.length; i++) {
                            if(result.logs[i].event == 'UserSetBackupWithdrawalAddress') {
                                newBackupAddress = result.logs[i].args._userBackupAddress
                            }
                        };
                        if(newBackupAddress == userSecondBackupAddress) {
                            return true;
                        }
                        return true;
                    }).then(function (result) {
                        assert.isTrue(result, "Second user registered backup address");
                    }); 
                });
            });
        });
    });


    // Another user (partner user) sends a deposit and has a new pool accepting deposits created for them as the previous one is now in countdown to launch mode and not accepting deposits
    it(partnerFirst+" - first partner send ether to RP on behalf of their user, second mini pool is created for them and is accepting deposits", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // RocketPool api now
                    return rocketPartnerAPI.deployed().then(function (rocketPartnerAPIInstance) {
                        // Get the min ether required to launch a mini pool
                        return rocketSettingsInstance.getPoolMinEtherRequired.call().then(function (result) {
                            // Transaction - Send Ether as a user, but send just enough to create the pool, but not launch it
                            var sendAmount = result.valueOf() - web3.toWei('1', 'ether'); 
                            // Deposit on a behalf of the partner and also specify the pool staking time ID
                            return rocketPartnerAPIInstance.APIpartnerDeposit(partnerFirstUserAccount, web3.sha3('default'), { from: partnerFirst, value: sendAmount, gas: rocketDepositGas }).then(function (result) {
                                var poolAddress = 0;
                                var poolCreated = false;
                                var poolStatus = null;
                                var poolBalance = 0;
                                var userRegistered = false;
                                var userPartnerAddress = 0;
                                for(var i=0; i < result.logs.length; i++) {
                                    if(result.logs[i].event == 'APIpartnerDepositAccepted') {
                                        userPartnerAddress = result.logs[i].args._partner;
                                    }
                                };
                                // Now find the pools our users belongs too, should just be one
                                return rocketPoolInstance.getPoolsFilterWithUser.call(partnerFirstUserAccount, { from: partnerFirst }).then(function (result) { 
                                    // Setup our checks
                                    var userPools = result.valueOf();
                                    // Get an instance of that pool and do further checks
                                    var miniPoolInstance = rocketPoolMini.at(userPools[0]);
                                    return miniPoolInstance.getStatus.call().then(function (result) {
                                        // Status = 0? The default
                                        poolStatus = result.valueOf();
                                        poolBalance = web3.eth.getBalance(miniPoolInstance.address).valueOf();
                                        // Now just count the users to make sure this user is the only one in this new pool
                                        return miniPoolInstance.getUserCount.call().then(function (result) {
                                            userCount = result.valueOf();
                                            // Now check everything
                                            if(poolStatus == 0 && poolBalance == sendAmount && userPartnerAddress == partnerFirst && userPools.length == 1) {
                                                return true;
                                            }
                                            return false;
                                        }).then(function (result) {
                                            assert.isTrue(result, "Funds transferred successfully, mini pool created, user registered with partner and funds Transferred to mini pool.");
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test


    // First partner withdraws half their users previous Ether from the pool before it has launched for staking
    it(partnerFirst+" - first partner withdraws half their users previous deposit from the mini pool", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool api now
                return rocketPartnerAPI.deployed().then(function (rocketPartnerAPIInstance) {
                    // RocketPool now
                    return rocketPool.deployed().then(function (rocketPoolInstance) {
                        // Get the users deposit total
                        return rocketPoolInstance.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount).then(function (result) {
                            var pools = result.valueOf();
                            if(pools.length != 1) {
                                return false;
                            }
                            // Get an instance of that pool and do further checks
                            var miniPoolInstance = rocketPoolMini.at(pools[0]);
                            return miniPoolInstance.getStatus.call().then(function (result) {
                                // Get the pool status
                                var poolStatus = result.valueOf();
                                // Get the user deposit
                                return miniPoolInstance.getUserDeposit.call(partnerFirstUserAccount).then(function (result) {
                                    var depositedAmount = result.valueOf();
                                    var withdrawalAmount = depositedAmount / 2;
                                    // Withdraw half our deposit now through the main parent contract
                                    return rocketPartnerAPIInstance.APIpartnerWithdrawDeposit(miniPoolInstance.address, withdrawalAmount, partnerFirstUserAccount, { from: partnerFirst, gas: 3000000 }).then(function (result) {
                                        // Get our balance again
                                        return miniPoolInstance.getUserDeposit.call(partnerFirstUserAccount).then(function (result) {
                                            var depositedAmountAfter = result.valueOf();
                                            if(depositedAmountAfter == (depositedAmount - withdrawalAmount)) {
                                                return true;
                                            }
                                            return false;
                                        });
                                    }).then(function (result) {
                                        assert.isTrue(result, "User has successfully withdrawn half of their balance from the mini pool.");
                                    });
                                });                            
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test



    // First partner user withdraws the remaining deposit from the mini pool, their user is removed from it and the mini pool is destroyed as it has no users anymore
    it(partnerFirst+" - first partner user withdraws the remaining deposit from the mini pool, their user is removed from it and the mini pool is destroyed as it has no users anymore.", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // RocketPool api now
                    return rocketPartnerAPI.deployed().then(function (rocketPartnerAPIInstance) {
                        // Get the users deposit total
                        return rocketPoolInstance.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount).then(function (result) {
                            var pools = result.valueOf();
                            if(pools.length != 1) {
                                return false;
                            }
                            // Get an instance of that pool and do further checks
                            var miniPoolInstance = rocketPoolMini.at(pools[0]);
                            return miniPoolInstance.getStatus.call().then(function (result) {
                                // Get the pool status
                                var poolStatus = result.valueOf();
                                // Get the user deposit
                                return miniPoolInstance.getUserDeposit.call(partnerFirstUserAccount).then(function (result) {
                                    var depositedAmount = result.valueOf();
                                    var withdrawalAmount = depositedAmount;                                
                                    // Withdraw our deposit now through the main parent contract
                                    return rocketPartnerAPIInstance.APIpartnerWithdrawDeposit(miniPoolInstance.address, withdrawalAmount, partnerFirstUserAccount, { from: partnerFirst, gas: rocketWithdrawalGas }).then(function (result) {                                    
                                        // See if RocketHub still recognises the pool contract after its been removed and self destructed
                                        return rocketHubInstance.getRocketMiniPoolExists.call(pools[0]).then(function (result) {                 
                                            // If the pool doesn't exist, success!
                                            return result.valueOf() == true ? false : true;
                                        }).then(function (result) {
                                            assert.isTrue(result, "User has successfully withdrawn their balance from the mini pool and has been removed from the pool.");
                                        });
                                    });
                                });                            
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test



    // Node performs first checkin, no pools should be launched yet
    it(nodeFirst+" - first node performs checkin, first mini pool awaiting launch should not be launched yet as the countdown has not passed.", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
                    // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
                    var averageLoad15mins = web3.toWei(((os.loadavg()[2] / os.cpus().length)), 'ether');
                    // Checkin now
                    return rocketPoolInstance.nodeCheckin(
                        nodeFirstValidationCode, // The nodes validation code
                        nodeFirstRandao, // The node randao
                        averageLoad15mins, // Server Load
                        { from: nodeFirst, gas: nodeCheckinGas }).then(function (result) {                           
                            for(var i=0; i < result.logs.length; i++) {
                                if (result.logs[i].event == 'NodeCheckin') {
                                    // Did our node checkin ok?                                  
                                    return nodeFirst == result.logs[i].args._nodeAddress && result.logs[i].args.loadAverage == averageLoad15mins ? true : false;
                                }
                            };
                    }).then(function (result) {
                        assert.isTrue(result, "Node has checked in successfully.");
                    });
                });
            });
        });  
    }); // End Test



    // Node performs second checkin, sets the launch time for mini pools to 0 so that the first awaiting mini pool is launched
    it(nodeFirst+" - first node performs second checkin, first mini pool awaiting launch should be launched as countdown is set to 0 and balance sent to Casper.", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
                    // Also Solidity doesn't deal with decimals atm, so convert to a whole number for the load
                    var averageLoad15mins = web3.toWei(((os.loadavg()[2] / os.cpus().length)), 'ether');
                    // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
                    return rocketSettingsInstance.setPoolCountdownTime(0, { from: web3.eth.coinbase, gas: 150000 }).then(function (result) {
                        // Checkin now
                        return rocketPoolInstance.nodeCheckin(
                            nodeFirstValidationCode, // The nodes validation code
                            nodeFirstRandao, // The node randao
                            averageLoad15mins, // Server Load
                            { from: nodeFirst, gas: nodeCheckinGas }).then(function (result) {
                                var nodeCheckinOk = false;
                                var miniPoolLaunched = false;
                                var miniPoolInstance = 0;
                                var miniPoolStatus = 0;
                                var miniPoolBalance = null;
                                for(var i=0; i < result.logs.length; i++) {
                                    if(result.logs[i].event == 'NodeCheckin') {
                                        // Did our node checkin ok?
                                        nodeCheckinOk = result.logs[i].args._nodeAddress && result.logs[i].args.loadAverage == averageLoad15mins ? true : false;
                                    }
                                    if(result.logs[i].event == 'PoolAssignedToNode') {
                                        // Did our mini pool launch ok?
                                        miniPoolLaunched = true;
                                        miniPoolInstance = rocketPoolMini.at(result.logs[i].args._miniPoolAddress);
                                    }
                                };
                                if(miniPoolLaunched) {
                                    return miniPoolInstance.getStatus.call().then(function (result) {
                                        // Status = 2? Launched
                                        miniPoolStatus = result.valueOf();
                                        // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                                        miniPoolBalance = web3.eth.getBalance(miniPoolInstance.address).valueOf();                                                                              
                                        // Ok Check it all now
                                        return nodeCheckinOk == true && miniPoolLaunched == true && miniPoolStatus == 2 && miniPoolBalance == 0 ? true : false;
                                    })
                                }
                                return false;      
                        }).then(function (result) {
                            assert.isTrue(result, "Node has checked in successfully and launched the first mini pool successfully.");
                        });
                    });
                });
            });
        });  
    }); // End Test

    
    // First user with deposit staking in minipool attempts to withdraw deposit before staking has finished
    it(userFirst+" - user fails to withdraw deposit while minipool is staking.", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Attemp withdrawal of all our deposit now
                    return rocketPoolInstance.userWithdrawDeposit(miniPoolFirstInstance.address, 0, { from: userFirst, gas: rocketWithdrawalGas }).then(function (result) {
                            return result;
                    }).then(function (result) {
                        assert(false, "Expect throw but didn't.");
                    }).catch(function (error) {
                        if (error.toString().indexOf("VM Exception") == -1) {
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
        });  
    }); // End Test



    // Node performs checkin
    it(nodeFirst+" - first node performs another checkin, first mini pool currently staking should remain staking.", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    var averageLoad15mins = web3.toWei(((os.loadavg()[2] / os.cpus().length)), 'ether');
                    // Checkin now
                    return rocketPoolInstance.nodeCheckin(
                        nodeFirstValidationCode, // The nodes validation code
                        nodeFirstRandao, // The node randao
                        averageLoad15mins, // Server Load
                        { from: nodeFirst, gas: nodeCheckinGas }).then(function (result) {
                             return miniPoolFirstInstance.getStatus.call().then(function (result) {
                                    // Status = 2? Still staking
                                    miniPoolStatus = result.valueOf();
                                    // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                                    miniPoolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();                                                                              
                                    // Ok Check it all now
                                    return miniPoolStatus == 2 && miniPoolBalance == 0 ? true : false;
                              })
                        }).then(function (result) {
                            assert.isTrue(result, "Node has checked in successfully.");
                        });
                });
            });
        });  
    }); // End Test


    // Update first mini pool
    it("------ first mini pool has staking duration set to 0 ------", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Set the mini pool staking duration to 0 for testing so it will attempt to request withdrawal from Casper
                    rocketPoolInstance.updatePoolStakingDuration(miniPoolFirstInstance.address, 0, { from: owner, gas: 150000 }).then(function (result) {
                        return true;
                    }).then(function (result) {
                        assert.isTrue(result, "First mini pool has staking duration set to 0.");
                    });
                });
            });
        });
    }); // End Test    


    // Node performs checkin
    it(nodeFirst+" - first node performs another checkin after first mini pool has staking duration set to 0 so it will signal awaiting withdrawal from Casper.", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    var averageLoad15mins = web3.toWei(((os.loadavg()[2] / os.cpus().length)), 'ether');
                    // Checkin now
                    return rocketPoolInstance.nodeCheckin(nodeFirstValidationCode, nodeFirstRandao, averageLoad15mins, { from: nodeFirst, gas: nodeCheckinGas }).then(function (result) {
                        return miniPoolFirstInstance.getStatus.call().then(function (result) {
                            // Status = 3? Awaiting withdrawal from Casper
                            miniPoolStatus = result.valueOf();
                            // Ok Check it all now
                            return miniPoolStatus == 3 ? true : false;
                        }).then(function (result) {
                            assert.isTrue(result, "Node has checked in successfully.");
                        });
                    });
                });
            });
        });
    }); // End Test


    // Update first mini pool withdrawal epoch in casper
    it("------ first mini pool has its withdrawal epoc within Casper set to 0 to allow it to ask Casper for final withdrawal ------", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return casper.deployed().then(function (casperInstance) {
                // Set the withdrawal request to a week ago
                var newWithdrawalEpoch = (Math.round(new Date().getTime()/1000)) - 604800;               
                return casperInstance.setWithdrawalEpoch(miniPoolFirstInstance.address, newWithdrawalEpoch, { from: owner, gas: 150000 }).then(function (result) {
                    // Now get it to check its been updated
                    return casperInstance.getWithdrawalEpoch.call(miniPoolFirstInstance.address, { from: owner }).then(function (result) {
                        if (result && result.valueOf() == newWithdrawalEpoch) {
                            return true;
                        }
                        return false;
                    }).then(function (result) {
                        assert.isTrue(result, "First mini pool has its withdrawal epoc within Casper set to 0");
                    });
                });
            });
        });
    }); // End Test   


    // Node performs checkin
    it(nodeFirst+" - first node performs another checkin and triggers first mini pool to change status and request actual deposit withdrawal from Casper.", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Our average load (simplified) is determined by average load / CPU cores since it is relative to how many cores there are in a system
                    // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
                    var averageLoad15mins = web3.toWei(((os.loadavg()[2] / os.cpus().length)), 'ether');
                    // Checkin now
                    return rocketPoolInstance.nodeCheckin(nodeFirstValidationCode, nodeFirstRandao, averageLoad15mins, { from: nodeFirst, gas: 950000 }).then(function (result) {
                        return miniPoolFirstInstance.getStatus.call().then(function (result) {                            
                            // Status = 4? Received deposit from casper + rewards
                            miniPoolStatus = result.valueOf();
                            // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                            miniPoolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf(); 
                            // Ok Check it all now
                            return miniPoolStatus == 4 && miniPoolBalance > 0 ? true : false;
                        }).then(function (result) {
                            assert.isTrue(result, "Status changed successfully and deposit received from Casper");
                        });
                    });
                });
            });
        });
    }); // End Test


    // Owner attempts to remove active node
    it(owner+" - fails to remove first node from the Rocket Pool network as it has mini pools attached to it.", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Remove the node now
                    return rocketPoolInstance.nodeRemove(nodeFirst, { from: owner, gas: 100000 }).then(function (result) {
                         return result;
                    }).then(function(result) {
                        assert(false, "Expect throw but didn't.");
                    }).catch(function(error) {
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
        });  
    }); // End Test


    // First user withdraws their deposit + rewards and pays Rocket Pools fee
    it(userFirst+" - first user withdraws their deposit + casper rewards from the mini pool and pays their fee", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Get the user deposit
                    return miniPoolFirstInstance.getUserDeposit.call(userFirst).then(function (result) {
                        // The balance before withdrawing
                        var depositedAmount = result.valueOf();
                        // Fee acount is the coinbase by default
                        var rpFeeAccountBalancePrev = web3.eth.getBalance(owner).valueOf(); 
                        // Get the mini pool balance
                        var miniPoolBalancePrev = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                        // Withdraw our total deposit + rewards
                        return rocketPoolInstance.userWithdrawDeposit(miniPoolFirstInstance.address, 0, { from: userFirst, gas: rocketWithdrawalGas }).then(function (result) {
                            var amountSentToUser = 0;
                            // Go through our events
                            for (var i = 0; i < result.logs.length; i++) {
                                if (result.logs[i].event == 'Transferred') {
                                    // Did our node checkin ok?
                                    amountSentToUser = result.logs[i].args.value;
                                }
                            }   
                            // Fee acount is the coinbase by default
                            var rpFeeAccountBalance = web3.eth.getBalance(owner).valueOf(); 
                            // Get the mini pool balance
                            var miniPoolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf(); 
                             // Now just count the users to make sure this user has been removed after withdrawing their balance and paying the fee
                            return miniPoolFirstInstance.getUserCount.call().then(function (result) {
                                var userCount = result.valueOf();
                                // Ok see if their account has been accredited with their deposit + rewards
                                if (depositedAmount < amountSentToUser && userCount == 1 && rpFeeAccountBalance > rpFeeAccountBalancePrev && miniPoolBalance < miniPoolBalancePrev) {
                                    return true;
                                }
                                return false;
                            });
                        }).then(function (result) {
                            assert.isTrue(result, "User has successfully withdrawn their final balance from the mini pool.");
                        });
                    });
                });
            });
        });  
    }); // End Test


    // Second user attempts to withdraw using their backup address before the time limit to do so is allowed (3 months by default)
    it(userSecond+" - second user fails to withdraw using their backup address before the time limit to do so is allowed", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Attempt tp withdraw our total deposit + rewards using our backup address
                    return rocketPoolInstance.userWithdrawDeposit(miniPoolFirstInstance.address, 0, { from: userSecondBackupAddress, gas: rocketWithdrawalGas }).then(function (result) {
                        //console.log(result.logs);
                        return result;
                    }).then(function(result) {
                        assert(false, "Expect throw but didn't.");
                    }).catch(function(error) {
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
        });  
    }); // End Test


    // Update first mini pool
    it("------ settings BackupCollectTime changed to 0 which will allow the user to withdraw via their backup address ------ ", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Set the backup withdrawal period to 0 to allow the user to withdraw using their backup address
                    rocketSettingsInstance.setPoolUserBackupCollectTime(0, { from: owner, gas: 150000 }).then(function (result) {
                        return true;
                    }).then(function (result) {
                        assert.isTrue(result, "settings BackupCollectTime changed to 0.");
                    });
                });
            });
        });
    }); // End Test 


    // First user attempts to withdraw again
    it(userFirst+" - first user fails to withdraw again from the pool as they've already completed withdrawal", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Attempt tp withdraw our total deposit + rewards using our backup address
                    return rocketPoolInstance.userWithdrawDeposit(miniPoolFirstInstance.address, 0, { from: userFirst, gas: rocketWithdrawalGas }).then(function (result) {
                        //console.log(result.logs);
                        return result;
                    }).then(function(result) {
                        assert(false, "Expect throw but didn't.");
                    }).catch(function(error) {
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
        });  
    }); // End Test

    
    // Second user withdraws their deposit + rewards and pays Rocket Pools fee, mini pool closes
    it(userSecond+" - second user withdraws their deposit + casper rewards using their backup address from the mini pool, pays their fee and the pool closes", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Get the user deposit
                    return miniPoolFirstInstance.getUserDeposit.call(userSecond).then(function (result) {
                        // The balance before withdrawing
                        var depositedAmount = result.valueOf();
                        // Fee acount is the coinbase by default
                        var rpFeeAccountBalancePrev = web3.eth.getBalance(owner).valueOf(); 
                        // Get the mini pool balance
                        var miniPoolBalancePrev = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                        // Withdraw our total deposit + rewards
                        return rocketPoolInstance.userWithdrawDeposit(miniPoolFirstInstance.address, 0, { from: userSecondBackupAddress, gas: rocketWithdrawalGas }).then(function (result) {
                            var amountSentToUser = 0;
                            // Go through our events
                            for (var i = 0; i < result.logs.length; i++) {
                                if (result.logs[i].event == 'Transferred') {
                                    // Did our node checkin ok?
                                    amountSentToUser = result.logs[i].args.value;
                                }
                            }   
                            // Fee acount is the coinbase by default
                            var rpFeeAccountBalance = web3.eth.getBalance(owner).valueOf(); 
                            // Get the mini pool balance
                            var miniPoolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf(); 
                             // See if RocketHub still recognises the pool contract after its been removed and self destructed
                            return rocketHubInstance.getRocketMiniPoolExists.call(miniPoolFirstInstance.address).then(function (result) {       
                                var poolExists = result.valueOf();
                                // Ok see if their account has been accredited with their deposit + rewards
                                if (depositedAmount < amountSentToUser && poolExists == false && rpFeeAccountBalance > rpFeeAccountBalancePrev && miniPoolBalance == 0) {
                                    return true;
                                }
                                return false;
                            }).then(function (result) {
                                assert.isTrue(result, "User has successfully withdrawn their final balance from the mini pool to their backup address and pool is now closed");
                            });
                        })
                    });
                });
            });
        });  
    }); // End Test
    
   

    // Owner removes first node
    it(owner+" - owner removes first node from the Rocket Pool network", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Remove the node now
                    return rocketPoolInstance.nodeRemove(nodeFirst, { from: owner, gas: 100000 }).then(function (result) {
                        // Go through our events
                        for (var i = 0; i < result.logs.length; i++) {
                            if (result.logs[i].event == 'NodeRemoved') {
                                // Did our node get removed ok?
                                var nodeAddress = result.logs[i].args._address;
                            }
                        }
                        if (nodeAddress == nodeFirst) {
                            return true;
                        }
                        return false;
                    }).then(function (result) {
                        assert.isTrue(result, "Owner has successfully removed the node from the Rocket network");
                    });
                });
            });
        });  
    }); // End Test


    // Owner removes first partner - users attached to this partner can still withdraw
    it(owner+" - owner removes first partner from the Rocket Pool network", function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // RocketPool api now
                    return rocketPartnerAPI.deployed().then(function (rocketPartnerAPIInstance) {
                        // Remove the node now
                        return rocketPartnerAPIInstance.partnerRemove(partnerFirst, { from: owner, gas: 100000 }).then(function (result) {
                            // Go through our events
                            for (var i = 0; i < result.logs.length; i++) {
                                if (result.logs[i].event == 'PartnerRemoved') {
                                    // Did our partner get removed ok?
                                    var partnerAddress = result.logs[i].args._address;
                                }
                            }
                            if (partnerAddress == partnerFirst) {
                                return true;
                            }
                            return false;
                        }).then(function (result) {
                            assert.isTrue(result, "Owner has successfully removed the partner from the Rocket network");
                        });
                    });
                });
            });
        });  
    }); // End Test
    

});


 


