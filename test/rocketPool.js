/*** Built with Truffle 3.2.4  */

var os = require("os");
var rocketHub = artifacts.require("./contract/RocketHub.sol");
var rocketNode = artifacts.require("./contract/RocketNode.sol");
var rocketPool = artifacts.require("./contract/RocketPool.sol");
var rocketPoolMini = artifacts.require("./contract/RocketPoolMini.sol");
var rocketDepositToken = artifacts.require("./contract/RocketDepositToken.sol");
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

// Print nice titles for each unit test
var printTitle = function(user, desc) {
    return '\x1b[33m'+user+'\033[00m\: \033[01;34m'+desc;
    //  PS1='${debian_chroot:+($debian_chroot)}\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
}


// Start the tests
contract('RocketPool', function (accounts) {
    
    // The owner
    var owner = web3.eth.coinbase;
    // RocketPool
    // Deposit gas has to cover potential mini pool contract creation, will often be much cheaper
    var rocketDepositGas = 2600000; //24
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
    var miniPoolSecondInstance;

    // Try to register a node as a non rocket pool owner 
    it(printTitle('non owner', 'fail to register a node'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // RocketNode now
            return rocketNode.deployed().then(function (rocketNodeInstance) {
                // Transaction
                return rocketNodeInstance.nodeRegister(nodeFirst, nodeFirstOracleID, nodeFirstInstanceID, { from:userFirst, gas: nodeRegisterGas }).then(function (result) {
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


    // Try to register a new partner as a non rocket pool owner 
    it(printTitle('non owner', 'fail to register a partner'), function () {
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
    
    
    // Register 2 nodes
    it(printTitle('owner', 'register 2 nodes'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // rocketNode now
            return rocketNode.deployed().then(function (rocketNodeInstance) {
                // Transaction
                return rocketNodeInstance.nodeRegister(nodeFirst, nodeFirstOracleID, nodeFirstInstanceID,  { from: web3.eth.coinbase, gas: nodeRegisterGas }).then(function (result) {
                    // Transaction
                    return rocketNodeInstance.nodeRegister(nodeSecond, nodeSecondOracleID, nodeSecondInstanceID, { from: web3.eth.coinbase, gas: nodeRegisterGas }).then(function (result) {
                        // Now get the total with a call
                        return rocketHubInstance.getRocketNodeCount.call();
                    }).then(function (result) {
                        assert.equal(result.valueOf(), 2, "2 Nodes registered successfully by owner");
                    });
                });
            });
        });    
    }); // End Test


    // Register two 3rd party partners
    it(printTitle('owner', 'register 2 partners'), function () {
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


    // Attempt to make a deposit with an incorrect pool staking time ID 
    it(printTitle('partnerFirst', 'fail to deposit with an incorrect pool staking time ID'), function () {
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

   
    // Attempt to make a deposit with an unregistered 3rd party partner 
    it(printTitle('userFirst', 'fail to deposit with an unregistered partner'), function () {
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
                            var sendAmount = parseInt(result.valueOf()) - parseInt(web3.toWei('1', 'ether'));
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



    // Send Ether to Rocket pool with just less than the min amount required to launch a mini pool with no specified 3rd party user partner
    it(printTitle('userFirst', 'sends ether to RP, create first mini pool, registers user with pool'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Get the min ether required to launch a mini pool
                    return rocketSettingsInstance.getPoolMinEtherRequired.call().then(function (result) {
                        // Transaction - Send Ether as a user, but send just enough to create the pool, but not launch it
                        var sendAmount = parseInt(result.valueOf()) - parseInt(web3.toWei('2', 'ether')); 
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
    it(printTitle('userFirst', 'sends ether to RP again, their balance updates, first mini pool remains accepting deposits and only 1 reg user'), function () {
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
    it(printTitle('userSecond', 'sends ether to RP, first mini pool status changes to countdown and only 2 reg users'), function () {
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
    it(printTitle('userSecond', 'registers a backup withdrawal address on their deposit while minipool is in countdown'), function () {
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
    it(printTitle('partnerFirst', 'send ether to RP on behalf of their user, second mini pool is created for them and is accepting deposits'), function () {
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
                            var sendAmount = parseInt(result.valueOf()) - parseInt(web3.toWei('1', 'ether')); 
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
    it(printTitle('partnerFirst', 'withdraws half their users previous deposit from the mini pool'), function () {
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
    it(printTitle('partnerFirst', 'withdraws their users remaining deposit from the mini pool, their user is removed from it and the mini pool is destroyed as it has no users anymore'), function () {
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


    
    it(printTitle('userThird', 'sends a lot of ether to RP, creates second mini pool, registers user with pool and sets status of minipool to countdown'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Get the min ether required to launch a mini pool
                    return rocketSettingsInstance.getPoolMinEtherRequired.call().then(function (result) {
                        // Transaction - Send Ether as a user, enough to create pool and set it into countdown
                        var sendAmount = result.valueOf(); 
                        return rocketPoolInstance.sendTransaction({ from: userThird, to: rocketPoolInstance.address, value: sendAmount, gas: rocketDepositGas }).then(function(result) {
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
                            miniPoolSecondInstance = rocketPoolMini.at(poolAddress);
                            return miniPoolSecondInstance.getStatus.call().then(function (result) {
                                // Status = 0? The default
                                poolStatus = result.valueOf();
                                poolBalance = web3.eth.getBalance(miniPoolSecondInstance.address).valueOf();
                                // Now check everything
                                if(poolCreated == true && poolStatus == 1 && poolBalance == sendAmount && userRegistered == true && userPartnerAddress == 0) {
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



    // Attempt to make a withdraw reocket deposit tokens too early
    it(printTitle('userThird', 'fail to withdraw Rocket Deposit Tokens before pool begins staking'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Try to withdraw tokens from that users minipool
                    rocketPoolInstance.userWithdrawDepositTokens(miniPoolSecondInstance.address, 0, { from: userThird, gas: 150000 }).then(function (result) {
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


    // Node performs first checkin, no pools should be launched yet
    it(printTitle('nodeFirst', 'first node performs checkin, no mini pool awaiting launch should not be launched yet as the countdown has not passed for either'), function () {
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
                            var nodeAddress = 0;
                            var loadAverage = 0;                      
                            for(var i=0; i < result.logs.length; i++) {
                                if (result.logs[i].event == 'NodeCheckin') {
                                    // Did our node checkin ok?       
                                    nodeAddress = result.logs[i].args._nodeAddress;
                                    loadAverage = result.logs[i].args.loadAverage;
                                }
                                if(result.logs[i].event == 'PoolAssignedToNode') {
                                    // Pool should not have been assigned to node
                                    return false;
                                }
                            };
                            return nodeFirst ==  nodeAddress && loadAverage ? true : false;
                    }).then(function (result) {
                        assert.isTrue(result, "Node has checked in successfully.");
                    });
                });
            });
        });  
    }); // End Test


    // Node performs second checkin, sets the launch time for mini pools to 0 so that the first awaiting mini pool is launched
    it(printTitle('nodeFirst', 'first node performs second checkin, 2 minipools awaiting launch should be launched as countdown is set to 0 and balance sent to Casper'), function () {
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
                    return rocketSettingsInstance.setPoolCountdownTime(0, { from: web3.eth.coinbase, gas: 500000 }).then(function (result) {
                        // Launching multiple pools at once can consume a lot of gas, estimate it first
                        return rocketPoolInstance.nodeCheckin.estimateGas(nodeFirstValidationCode, nodeFirstRandao, averageLoad15mins, {from: nodeFirst}).then(function (gasEstimate) {                           
                            // Checkin now
                            return rocketPoolInstance.nodeCheckin(
                                nodeFirstValidationCode, // The nodes validation code
                                nodeFirstRandao, // The node randao
                                averageLoad15mins, // Server Load
                                { from: nodeFirst, gas: parseInt(gasEstimate)+100000 }).then(function (result) {
        
                                    var nodeCheckinOk = false;
                                    var minipools = [];
                                    var minipoolParams = {
                                            address: 0,
                                            instance: 0,
                                            status: 0,
                                            balance: 0
                                    };
                                    for(var i=0; i < result.logs.length; i++) {
                                        if(result.logs[i].event == 'NodeCheckin') {
                                            // Did our node checkin ok?
                                            nodeCheckinOk = result.logs[i].args._nodeAddress && result.logs[i].args.loadAverage == averageLoad15mins ? true : false;
                                        }
                                        if(result.logs[i].event == 'PoolAssignedToNode') {
                                            // Did our mini pool launch ok?
                                            minipoolParams.address = result.logs[i].args._miniPoolAddress;
                                            minipoolParams.instance = rocketPoolMini.at(minipoolParams.address);
                                            minipools.push(minipoolParams);
                                        }
                                    };
                                    if(minipools.length > 0) {
                                        // Update the pool info
                                        return minipools[0].instance.getStatus.call().then(function (result) {
                                            // Status = 2? Launched
                                            minipools[0].status = result.valueOf();
                                            // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                                            minipools[0].balance = web3.eth.getBalance(minipools[0].address).valueOf();         
                                            // Update the pool info
                                            return minipools[1].instance.getStatus.call().then(function (result) {
                                                // Status = 2? Launched
                                                minipools[1].status = result.valueOf();
                                                // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                                                minipools[1].balance = web3.eth.getBalance(minipools[1].address).valueOf();                                                                              
                                                // Check it all now
                                                return nodeCheckinOk == true && 
                                                    minipools.length == 2 &&
                                                    minipools[0].status == 2 && 
                                                    minipools[0].balance == 0 &&
                                                    minipools[1].status == 2 && 
                                                    minipools[1].balance == 0
                                                    ? true : false;
                                            }).then(function (result) {
                                                assert.isTrue(result, "Node has checked in successfully and launched the first mini pool successfully.");
                                            });
                                        });
                                        
                                    }
                                return false;   
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test

    
    it(printTitle('userThird', 'withdraws 50% of their deposit as Rocket Deposit Tokens while their minipool is staking with Casper'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // Get the token withdrawal fee
                return rocketSettingsInstance.getDepositTokenWithdrawalFeePercInWei.call().then(function (result) {
                    // Token fee
                    var tokenWithdrawalFee = parseInt(result.valueOf());
                    // Check rocketDepositToken is deployed   
                    return rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
                         // Get the total supply of tokens in circulation
                        return rocketDepositTokenInstance.totalSupply.call({ from: userThird }).then(function (result) {
                            var totalTokenSupply = parseInt(result.valueOf());
                            // RocketPool now
                            return rocketPool.deployed().then(function (rocketPoolInstance) {
                                // Third user deposited the min required to launch a pool earlier, we need this amount so we can calculate 50%
                                return miniPoolSecondInstance.getUserDeposit.call(userThird).then(function (result) {
                                    var withdrawHalfAmount = parseInt(result.valueOf())/2;                               
                                    // Fee incurred on tokens
                                    var tokenBalanceFeeIncurred = parseFloat(web3.fromWei(tokenWithdrawalFee, 'ether') * web3.fromWei(withdrawHalfAmount, 'ether'));
                                    // Try to withdraw tokens from that users minipool
                                    return rocketPoolInstance.userWithdrawDepositTokens(miniPoolSecondInstance.address, withdrawHalfAmount, { from: userThird, gas: 250000 }).then(function (result) {
                                        // Get the total supply of tokens in circulation
                                        return rocketDepositTokenInstance.totalSupply({ from: userThird }).then(function (result) {
                                            var totalTokenSupplyAfter = web3.fromWei(parseInt(result.valueOf()), 'ether');                                            
                                            // Now count how many tokens that user has, should match the amount withdrawn
                                            return rocketDepositTokenInstance.balanceOf.call(userThird).then(function (result) {
                                                // Now count how many tokens that user has, should match the amount withdrawn - fees
                                                var tokenBalance = parseFloat(web3.fromWei(result.valueOf(), 'ether'));
                                                var userBalance = null;
                                                return miniPoolSecondInstance.getUserDeposit.call(userThird).then(function (result) {
                                                    // The balance after withdrawing tokens
                                                    var userBalance = result.valueOf();
                                                    //console.log(tokenBalanceFeeIncurred, tokenBalance, (web3.fromWei(withdrawHalfAmount, 'ether') - tokenBalanceFeeIncurred), totalTokenSupplyAfter);
                                                    // Check everything
                                                    return tokenBalance == (web3.fromWei(withdrawHalfAmount, 'ether') - tokenBalanceFeeIncurred) &&
                                                        tokenBalance == totalTokenSupplyAfter &&
                                                        userBalance == withdrawHalfAmount
                                                        ? true : false;
                                                }).then(function (result) {
                                                    assert.isTrue(result, "Users tokens do not match the amount withdrawn");
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
    }); // End Test



    it(printTitle('userThird', 'transfers half of their deposit tokens to userFirst on the open market'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // Check rocketDepositToken is deployed   
                return rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
                    // Now count how many tokens that user has
                    return rocketDepositTokenInstance.balanceOf.call(userThird).then(function (result) {
                        // Their token balance
                        var userThirdTokenBalance = parseInt(result.valueOf());
                        // Transfer half to first user on the open market
                        var tokenTransferAmount = userThirdTokenBalance / 2;
                        // Transfer now
                        return rocketDepositTokenInstance.transfer(userFirst, tokenTransferAmount, { from: userThird, gas: 250000 }).then(function (result) {
                            // Now count how many tokens that user has
                            return rocketDepositTokenInstance.balanceOf.call(userThird).then(function (result) {
                                var userThirdTokenBalanceAfter = parseInt(result.valueOf());
                                // Now count first users
                                return rocketDepositTokenInstance.balanceOf.call(userFirst).then(function (result) {
                                    var userFirstTokenBalance = parseInt(result.valueOf());                                   
                                    return userThirdTokenBalanceAfter == (userThirdTokenBalance - tokenTransferAmount) && userFirstTokenBalance == tokenTransferAmount ? true : false;
                                }).then(function (result) {
                                    assert.isTrue(result, "Users tokens do not match the amount transferred");
                                });
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test


    it(printTitle('userThird', 'fails to transfer more tokens than they own on the open market'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // Check rocketDepositToken is deployed   
                return rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
                    // Now count how many tokens that user has
                    return rocketDepositTokenInstance.balanceOf.call(userThird).then(function (result) {
                        // Their token balance
                        var userThirdTokenBalance = parseInt(result.valueOf());
                        // Transfer to first user on the open market
                        var tokenTransferAmount = userThirdTokenBalance + 10000;
                        // Transfer now
                        return rocketDepositTokenInstance.transfer(userFirst, tokenTransferAmount, { from: userThird, gas: 250000 }).then(function (result) {
                            // Now count how many tokens that user has
                            return rocketDepositTokenInstance.balanceOf.call(userThird).then(function (result) {
                                var userThirdTokenBalanceAfter = parseInt(result.valueOf());
                                // Check they didn't send any
                                return userThirdTokenBalance == userThirdTokenBalanceAfter ? true : false;
                            }).then(function (result) {
                                assert.isTrue(result, "Users tokens were transferred");
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test


    it(printTitle('userThird', 'fails to transfer tokens from userFirst account to themselves on the open market'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // Check rocketDepositToken is deployed   
                return rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
                    // Now count how many tokens that user has
                    return rocketDepositTokenInstance.balanceOf.call(userFirst).then(function (result) {
                        // Their token balance
                        var userFirstTokenBalance = parseInt(result.valueOf());
                        // Transfer to third user on the open market
                        var tokenTransferAmount = userFirstTokenBalance / 2;
                        // Transfer now
                        return rocketDepositTokenInstance.transferFrom(userFirst, userThird, tokenTransferAmount, { from: userThird, gas: 250000 }).then(function (result) {
                            // Now count how many tokens that user has
                            return rocketDepositTokenInstance.balanceOf.call(userFirst).then(function (result) {
                                var userFirstTokenBalanceAfter = parseInt(result.valueOf());
                                // Check they didn't send any
                                return userFirstTokenBalance == userFirstTokenBalanceAfter ? true : false;
                            }).then(function (result) {
                                assert.isTrue(result, "Users tokens were transferred");
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test


    it(printTitle('userThird', 'fails to trade their tokens for ether in the rocket deposit token fund as it does not have enough ether to cover the amount sent'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // Check rocketDepositToken is deployed   
                return rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
                    // Now count how many tokens that user has
                    return rocketDepositTokenInstance.balanceOf.call(userThird).then(function (result) {
                        // Their token balance
                        var userThirdTokenBalance = parseInt(result.valueOf());
                        // Transfer now
                        return rocketDepositTokenInstance.burnTokensForEther(userThirdTokenBalance, { from: userThird, gas: 250000 }).then(function (result) {
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
    }); // End Test


    it(printTitle('userThird', 'withdraws the remainder of their deposit as Rocket Deposit Tokens while their minipool is staking with Casper and are removed from pool'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // Get the token withdrawal fee
                return rocketSettingsInstance.getDepositTokenWithdrawalFeePercInWei.call().then(function (result) {
                    // Token fee
                    var tokenWithdrawalFee = parseInt(result.valueOf());
                    // Check rocketDepositToken is deployed   
                    return rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
                        // RocketPool now
                        return rocketPool.deployed().then(function (rocketPoolInstance) {
                            // Withdraw all by passing 0
                            return rocketPoolInstance.userWithdrawDepositTokens(miniPoolSecondInstance.address, 0, { from: userThird, gas: 250000 }).then(function (result) {
                                // User should be removed from pool now as they dont have any deposit left, they traded it all for deposit tokens
                                // Will throw if user doesn't exist in pool
                                return miniPoolSecondInstance.getUserDeposit.call(userThird).then(function (result) {
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
        });  
    }); // End Test


  
    // First user with deposit staking in minipool attempts to withdraw deposit before staking has finished
    it(printTitle('userFirst', 'user fails to withdraw deposit while minipool is staking'), function () {
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
    it(printTitle('nodeFirst', 'first node performs another checkin, first mini pool currently staking should remain staking'), function () {
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
    it(printTitle('---------', 'first mini pool has staking duration set to 0'), function () {
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


    // Update second mini pool
    it(printTitle('---------', 'second mini pool has staking duration set to 0'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Set the mini pool staking duration to 0 for testing so it will attempt to request withdrawal from Casper
                    rocketPoolInstance.updatePoolStakingDuration(miniPoolSecondInstance.address, 0, { from: owner, gas: 150000 }).then(function (result) {
                        return true;
                    }).then(function (result) {
                        assert.isTrue(result, "Second mini pool has staking duration set to 0.");
                    });
                });
            });
        });
    }); // End Test    


    // Node performs checkin
    it(printTitle('nodeFirst', 'first node performs another checkin after both minipools have staking duration set to 0 so they will signal awaiting withdrawal from Casper'), function () {
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
                            var miniPoolStatusFirst = result.valueOf();
                            return miniPoolSecondInstance.getStatus.call().then(function (result) {
                                // Status = 3? Awaiting withdrawal from Casper
                                var miniPoolStatusSecond = result.valueOf();
                                // Ok Check it all now
                                return miniPoolStatusFirst == 3 && miniPoolStatusSecond == 3 ? true : false;
                            });
                        }).then(function (result) {
                            assert.isTrue(result, "Node has checked in successfully.");
                        });
                    });
                });
            });
        });
    }); // End Test


    // Update first mini pool withdrawal epoch in casper
    it(printTitle('---------', 'first mini pool has its withdrawal epoc within Casper set to 0 to allow it to ask Casper for final withdrawal'), function () {
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
    

    // Update second mini pool withdrawal epoch in casper
    it(printTitle('---------', 'second mini pool has its withdrawal epoc within Casper set to 0 to allow it to ask Casper for final withdrawal'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return casper.deployed().then(function (casperInstance) {
                // Set the withdrawal request to a week ago
                var newWithdrawalEpoch = (Math.round(new Date().getTime()/1000)) - 604800;               
                return casperInstance.setWithdrawalEpoch(miniPoolSecondInstance.address, newWithdrawalEpoch, { from: owner, gas: 150000 }).then(function (result) {
                    // Now get it to check its been updated
                    return casperInstance.getWithdrawalEpoch.call(miniPoolSecondInstance.address, { from: owner }).then(function (result) {
                        if (result && result.valueOf() == newWithdrawalEpoch) {
                            return true;
                        }
                        return false;
                    }).then(function (result) {
                        assert.isTrue(result, "Second mini pool has its withdrawal epoc within Casper set to 0");
                    });
                });
            });
        });
    }); // End Test  


    // Node performs checkin
    it(printTitle('nodeFirst', 'first node performs another checkin and triggers both mini pools to change status and request actual deposit withdrawal from Casper'), function () {
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
                            var miniPoolStatusFirst = result.valueOf();
                            // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                            var miniPoolBalanceFirst = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf(); 
                            // Check second pool
                            return miniPoolSecondInstance.getStatus.call().then(function (result) {
                                // Status = 4? Received deposit from casper + rewards
                                var miniPoolStatusSecond = result.valueOf();
                                // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                                var miniPoolBalanceSecond = web3.eth.getBalance(miniPoolSecondInstance.address).valueOf(); 
                                //console.log(miniPoolStatusFirst, miniPoolBalanceFirst);
                                //console.log(miniPoolStatusSecond, miniPoolBalanceSecond);
                                // Ok Check it all now
                                // second minipool was automatically closed when receiving deposit from Casper 
                                // as all its users had been removed when taking their entire deposit out as tokens
                                return (miniPoolStatusFirst == 4  && miniPoolBalanceFirst > 0)  && (miniPoolStatusSecond == 0 && miniPoolBalanceSecond == 0)  ? true : false;
                            }).then(function (result) {
                                assert.isTrue(result, "Status changed successfully and deposit received from Casper");
                            });
                        })
                    });
                });
            });
        });
    }); // End Test


    it(printTitle('---------', 'all of userThirds withdrawn token backed ethers should be in the deposit token fund now'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Get the min ether required to launch a mini pool - the user sent half this amount for tokens originally
                    return rocketSettingsInstance.getPoolMinEtherRequired.call().then(function (result) {
                        // These ethers are ones they withdrew tokens against
                        var etherAmountTradedSentForTokens = parseInt(result.valueOf());    
                        // Check rocketDepositToken is deployed   
                        return rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
                            // Now count how many tokens that user has
                            return rocketDepositTokenInstance.balanceOf.call(userThird).then(function (result) {
                                var depositTokenFundBalance = web3.eth.getBalance(rocketDepositTokenInstance.address).valueOf(); 
                                // Ok?
                                return depositTokenFundBalance == etherAmountTradedSentForTokens ? true : false;
                            }).then(function (result) {
                                assert.isTrue(result, "depositTokenFundBalance does not match etherAmountTradedSentForTokens");
                            });
                        });
                    });
                });
            });
        });  
    }); // End Test    


    it(printTitle('userFirst', 'burns their deposit tokens received from userThird in return for ether + bonus'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // Check rocketDepositToken is deployed   
                return rocketDepositToken.deployed().then(function (rocketDepositTokenInstance) {
                     // Get the token withdrawal fee
                    return rocketSettingsInstance.getDepositTokenWithdrawalFeePercInWei.call().then(function (result) {
                        // Token fee - this goes to the person who trades the tokens back in
                        var tokenWithdrawalFee = parseFloat(web3.fromWei(result.valueOf(), 'ether'));
                        // Get the total supply of tokens in circulation
                        return rocketDepositTokenInstance.totalSupply.call().then(function (result) {
                            var fundTokenBalance = parseFloat(result.valueOf());
                            //console.log(result.valueOf());
                            //console.log(web3.fromWei(fundTokenBalance, 'ether'));
                            // Now count how many tokens that user has
                            return rocketDepositTokenInstance.balanceOf.call(userFirst).then(function (result) {
                                // Their token balance
                                var userFirstTokenBalance = parseFloat(result.valueOf());
                                var userFirstEtherBalance = web3.eth.getBalance(userFirst).valueOf();
                                var burnGas = 250000;
                                // console.log(web3.fromWei(userFirstTokenBalance, 'ether'), web3.fromWei(userFirstEtherBalance, 'ether'));
                                // Transfer now
                                return rocketDepositTokenInstance.burnTokensForEther(userFirstTokenBalance, { from: userFirst, gas: burnGas }).then(function (result) {
                                    // Now count how many tokens that user has, should be none
                                    return rocketDepositTokenInstance.balanceOf.call(userFirst).then(function (result) {
                                        var userFirstTokenBalanceAfter = parseFloat(result.valueOf());
                                        var userFirstEtherBalanceAfter = web3.eth.getBalance(userFirst).valueOf();
                                        // Now check the tokens were burnt
                                        return rocketDepositTokenInstance.totalSupply.call().then(function (result) {
                                            var fundTokenBalanceAfter = parseFloat(result.valueOf());
                                            var etherAccountDiff = (userFirstEtherBalanceAfter - userFirstEtherBalance);
                                            //var etherAccountTradeWithBonus = (userFirstTokenBalance * (parseFloat(tokenWithdrawalFee + 1)));
                                            // Now check 
                                            return userFirstTokenBalanceAfter == 0 &&
                                                fundTokenBalanceAfter == (parseFloat(fundTokenBalance) - parseFloat(userFirstTokenBalance)) &&
                                                etherAccountDiff > 0
                                                ? true : false;
                                        }).then(function (result) {
                                            assert.isTrue(result, "Users tokens do not match the amount transferred");
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




    // Owner attempts to remove active node
    it(printTitle('owner', 'fails to remove first node from the Rocket Pool network as it has mini pools attached to it'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketNode now
                return rocketNode.deployed().then(function (rocketNodeInstance) {
                    // Remove the node now
                    return rocketNodeInstance.nodeRemove(nodeFirst, { from: owner, gas: 200000 }).then(function (result) {
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
    it(printTitle('userFirst', 'withdraws their deposit + casper rewards from the mini pool and pays their fee'), function () {
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
    it(printTitle('userSecond', 'fails to withdraw using their backup address before the time limit to do so is allowed'), function () {
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
    it(printTitle('---------', 'settings BackupCollectTime changed to 0 which will allow the user to withdraw via their backup address'), function () {
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
    it(printTitle('userFirst', 'fails to withdraw again from the pool as they\'ve already completed withdrawal'), function () {
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
    it(printTitle('userSecond', 'withdraws their deposit + casper rewards using their backup address from the mini pool, pays their fee and the pool closes'), function () {
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


    it(printTitle('userThird', 'fails to withdraw deposit as they already traded it all for rocket deposit tokens'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketSettings is deployed   
            return rocketSettings.deployed().then(function (rocketSettingsInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Get the user deposit
                     return rocketPoolInstance.userWithdrawDeposit(miniPoolSecondInstance.address, 0, { from: userThird, gas: rocketWithdrawalGas }).then(function (result) {
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


    // Owner removes first node
    it(printTitle('owner', 'removes first node from the Rocket Pool network'), function () {
        // Check RocketHub is deployed first    
        return rocketHub.deployed().then(function (rocketHubInstance) {
            // Check RocketNode is deployed   
            return rocketNode.deployed().then(function (rocketNodeInstance) {
                // RocketPool now
                return rocketPool.deployed().then(function (rocketPoolInstance) {
                    // Remove the node now
                    return rocketNodeInstance.nodeRemove(nodeFirst, { from: owner, gas: 200000 }).then(function (result) {
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
    it(printTitle('owner', 'removes first partner from the Rocket Pool network'), function () {
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


 


