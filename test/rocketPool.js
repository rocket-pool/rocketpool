/*** Built with Truffle 4.0.1  */

const os = require('os');
const rocketUser = artifacts.require('./contract/RocketUser.sol');
const rocketNode = artifacts.require('./contract/RocketNode.sol');
const rocketPool = artifacts.require('./contract/RocketPool.sol');
const rocketPoolMini = artifacts.require('./contract/RocketPoolMini.sol');
const rocketDepositToken = artifacts.require('./contract/RocketDepositToken.sol');
const rocketPartnerAPI = artifacts.require('./contract/RocketPartnerAPI.sol');
const rocketSettings = artifacts.require('./contract/RocketSettings.sol');
const rocketStorage = artifacts.require('./contract/RocketStorage.sol');
const casper = artifacts.require('./contract/Casper/DummyCasper.sol');

const displayEvents = false;

// Display events triggered during the tests
if (displayEvents) {
  rocketPool.deployed().then(rocketPoolInstance => {
    const eventWatch = rocketPoolInstance
      .allEvents({
        fromBlock: 0,
        toBlock: 'latest',
      })
      .watch((error, result) => {
        // Print the event to console
        const printEvent = (type, result, colour) => {
          console.log('\n');
          console.log(
            colour,
            '*** ' + type.toUpperCase() + ' EVENT: ' + result.event + ' *******************************'
          );
          console.log('\n');
          console.log(result.args);
          console.log('\n');
        };
        // This will catch all events, regardless of how they originated.
        if (error == null) {
          // Print the event
          printEvent('rocket', result, '\x1b[33m%s\x1b[0m:');
          // Listen for new pool events too
          if (result.event == 'PoolCreated') {
            // Get an instance of that pool
            const poolInstance = rocketPoolMini.at(result.args._address);
            // Watch for events in mini pools also as with the main contract
            const poolEventWatch = poolInstance
              .allEvents({
                fromBlock: 0,
                toBlock: 'latest',
              })
              .watch((error, result) => {
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
const printTitle = (user, desc) => {
  return '\x1b[33m' + user + '\033[00m: \033[01;34m' + desc;
  //  PS1='${debian_chroot:+($debian_chroot)}\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
};

// Checks to see if a throw was triggered
const checkThrow = error => {
  if (error.toString().indexOf('VM Exception') == -1) {
    // Didn't throw like we expected
    return assert(false, error.toString());
  }
  // Always show out of gas errors
  if (error.toString().indexOf('out of gas') != -1) {
    return assert(false, error.toString());
  }
};

// Start the tests
contract('RocketPool', accounts => {
  // Excessive? Yeah probably :)
  console.log('\n');
  console.log('______           _        _    ______           _ ');
  console.log('| ___ \\         | |      | |   | ___ \\         | |');
  console.log('| |_/ /___   ___| | _____| |_  | |_/ /__   ___ | |');
  console.log('|    // _ \\ / __| |/ / _ \\ __| |  __/ _ \\ / _ \\| |');
  console.log('| |\\ \\ (_) | (__|   <  __/ |_  | | | (_) | (_) | |');
  console.log('\\_| \\_\\___/ \\___|_|\\_\\___|\\__| \\_|  \\___/ \\___/|_|');

  // The owner
  const owner = web3.eth.coinbase;
  // RocketPool
  // Deposit gas has to cover potential mini pool contract creation, will often be much cheaper
  const rocketDepositGas = 4800000;
  const rocketWithdrawalGas = 1450000;
  // Node accounts and gas settings
  const nodeFirst = accounts[8];
  const nodeFirstOracleID = 'aws';
  const nodeFirstInstanceID = 'i-1234567890abcdef5';
  const nodeSecond = accounts[9];
  const nodeSecondOracleID = 'rackspace';
  const nodeSecondInstanceID = '4325';
  const nodeRegisterGas = 500000;
  const nodeCheckinGas = 950000;
  // UPDATE: The first version of Casper wont use the validation code, just the address of the validator, will keep this in for now incase it changes in the future
  // Bytes -Set the node validation code (EVM bytecode, serving as a sort of public key that will be used to verify blocks and other consensus messages signed by it - just an example below)
  // (converted to Bytes32 until Solidity allows passing of variable length types (bytes, string) between contracts - https://github.com/ethereum/EIPs/pull/211 )
  // const nodeFirstValidationCode = web3.sha3('PUSH1 0 CALLDATALOAD SLOAD NOT PUSH1 9 JUMPI STOP JUMPDEST PUSH1 32 CALLDATALOAD PUSH1 0 CALLDATALOAD SSTORE');
  // Bytes32 - Node value provided for the casper deposit function should be the result of computing a long chain of hashes (TODO: this will need work in the future when its defined better)
  // const nodeFirstRandao = '0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658';
  // User accounts
  const userFirst = accounts[1];
  const userSecond = accounts[2];
  const userSecondBackupAddress = accounts[4];
  const userThird = accounts[3];
  // Partner accounts (not real)
  const partnerFirst = accounts[5];
  const partnerFirstName = 'Coinbase';
  const partnerFirstUserAccount = accounts[6];
  const partnerSecond = accounts[7];
  const partnerSecondName = 'MEW';
  const partnerRegisterGas = 200000;
  // Mini Pools
  let miniPoolFirstInstance;
  let miniPoolSecondInstance;

  // Owners direct access to storage is removed after initialisation when deployed
  it(printTitle('owner', 'fail to access storage directly after deployment'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Transaction
      return rocketStorageInstance
        .setBool(web3.sha3('test.access'), true, { from: owner, gas: 250000 })
        .then(result => {
          return result;
        })
        .then(result => {
          assert(false, "Expect throw but didn't.");
        })
        .catch(error => {
          return checkThrow(error);
        });
    });
  }); // End Test

  // Try to register a node as a non rocket pool owner
  it(printTitle('non owner', 'fail to register a node'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // RocketNode now
      return rocketNode.deployed().then(rocketNodeInstance => {
        // Transaction
        return rocketNodeInstance
          .nodeAdd(nodeFirst, nodeFirstOracleID, nodeFirstInstanceID, { from: userFirst, gas: nodeRegisterGas })
          .then(result => {
            return result;
          })
          .then(result => {
            assert(false, "Expect throw but didn't.");
          })
          .catch(error => {
            return checkThrow(error);
          });
      });
    });
  }); // End Test

  // Register 2 nodes
  it(printTitle('owner', 'register 2 nodes'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // rocketNode now
      return rocketNode.deployed().then(rocketNodeInstance => {
        // Transaction
        return rocketNodeInstance
          .nodeAdd(nodeFirst, nodeFirstOracleID, nodeFirstInstanceID, { from: owner, gas: nodeRegisterGas })
          .then(result => {
            // Transaction
            return rocketNodeInstance
              .nodeAdd(nodeSecond, nodeSecondOracleID, nodeSecondInstanceID, { from: owner, gas: nodeRegisterGas })
              .then(result => {
                // Now get the total with a call
                return rocketNodeInstance.getNodeCount.call();
              })
              .then(result => {
                assert.equal(result.valueOf(), 2, '2 Nodes registered successfully by owner');
              });
          });
      });
    });
  }); // End Test

  // Try to register a new partner as a non rocket pool owner
  it(printTitle('non owner', 'fail to register a partner'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // RocketPool api now
      return rocketPartnerAPI.deployed().then(rocketPartnerAPIInstance => {
        // Transaction
        return rocketPartnerAPIInstance
          .partnerAdd(partnerFirst, partnerFirstName, { from: userFirst, gas: partnerRegisterGas })
          .then(result => {
            return result;
          })
          .then(result => {
            assert(false, "Expect throw but didn't.");
          })
          .catch(error => {
            return checkThrow(error);
          });
      });
    });
  }); // End Test

  // Register two 3rd party partners
  it(printTitle('owner', 'register 2 partners'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // RocketPool api now
      return rocketPartnerAPI.deployed().then(rocketPartnerAPIInstance => {
        // Transaction
        return rocketPartnerAPIInstance
          .partnerAdd(partnerFirst, partnerFirstName, { from: web3.eth.coinbase, gas: partnerRegisterGas })
          .then(result => {
            // Transaction
            return rocketPartnerAPIInstance
              .partnerAdd(partnerSecond, partnerSecondName, { from: web3.eth.coinbase, gas: partnerRegisterGas })
              .then(result => {
                // Now get the total with a call
                return rocketPartnerAPIInstance.getPartnerCount.call();
              })
              .then(result => {
                assert.equal(result.valueOf(), 2, '2 Partners registered successfully by owner');
              });
          });
      });
    });
  }); // End Test

  // Attempt to make a deposit with an incorrect pool staking time ID
  it(printTitle('partnerFirst', 'fail to deposit with an incorrect pool staking time ID'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketPool now
        return rocketPool.deployed().then(rocketPoolInstance => {
          // RocketPool api now
          return rocketPartnerAPI.deployed().then(rocketPartnerAPIInstance => {
            // Get the min ether required to launch a mini pool
            return rocketSettingsInstance.getPoolMinEtherRequired.call().then(result => {
              // Transaction - Send Ether as a user, but send just enough to create the pool, but not launch it
              const sendAmount = result.valueOf() - web3.toWei('1', 'ether');
              // Deposit on a behalf of the partner and also specify a incorrect pool staking time ID
              return rocketPartnerAPIInstance
                .APIpartnerDeposit(partnerFirstUserAccount, 'beer', {
                  from: partnerFirst,
                  value: sendAmount,
                  gas: rocketDepositGas,
                })
                .then(result => {
                  return result;
                })
                .then(result => {
                  assert(false, "Expect throw but didn't.");
                })
                .catch(error => {
                  return checkThrow(error);
                });
            });
          });
        });
      });
    });
  }); // End Test

  // Attempt to make a deposit with an unregistered 3rd party partner
  it(printTitle('userFirst', 'fail to deposit with an unregistered partner'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketPool now
        return rocketPool.deployed().then(rocketPoolInstance => {
          // RocketPool api now
          return rocketPartnerAPI.deployed().then(rocketPartnerAPIInstance => {
            // Get the min ether required to launch a mini pool
            return rocketSettingsInstance.getPoolMinEtherRequired.call().then(result => {
              // Transaction - Send Ether as a user, but send just enough to create the pool, but not launch it
              const sendAmount = parseInt(result.valueOf()) - parseInt(web3.toWei('1', 'ether'));
              // Deposit on a behalf of the partner and also specify the pool staking time ID
              return rocketPartnerAPIInstance
                .APIpartnerDeposit(userThird, 'default', { from: userSecond, value: sendAmount, gas: rocketDepositGas })
                .then(result => {
                  return result;
                })
                .then(result => {
                  assert(false, "Expect throw but didn't.");
                })
                .catch(error => {
                  return checkThrow(error);
                });
            });
          });
        });
      });
    });
  }); // End Test

  // Send Ether to Rocket pool with just less than the min amount required to launch a mini pool with no specified 3rd party user partner
  it(printTitle('userFirst', 'sends ether to RP, create first mini pool, registers user with pool'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketUser now
        return rocketUser.deployed().then(rocketUserInstance => {
          // Get the min ether required to launch a mini pool
          return rocketSettingsInstance.getPoolMinEtherRequired.call().then(result => {
            // Transaction - Send Ether as a user, but send just enough to create the pool, but not launch it
            const sendAmount = parseInt(result.valueOf()) - parseInt(web3.toWei('2', 'ether'));
            return rocketUserInstance
              .userDeposit('default', {
                from: userFirst,
                to: rocketUserInstance.address,
                value: sendAmount,
                gas: rocketDepositGas,
              })
              .then(result => {
                // Now check the events
                let poolAddress = 0;
                let poolCreated = false;
                let poolStatus = null;
                let poolBalance = 0;

                result.logs.forEach(log => {
                  if (log.event == 'Transferred') {
                    poolCreated = true;
                    poolAddress = log.args._to;
                  }
                });

                // Get an instance of that pool and do further checks
                miniPoolFirstInstance = rocketPoolMini.at(poolAddress);
                return miniPoolFirstInstance.getStatus
                  .call()
                  .then(result => {
                    // Status = 0? The default
                    poolStatus = result.valueOf();
                    poolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                    // Now check everything
                    if (poolCreated == true && poolStatus == 0 && poolBalance == sendAmount) {
                      return true;
                    }
                    return false;
                  })
                  .then(result => {
                    assert.isTrue(
                      result,
                      'Funds transferred successfully, mini pool created, user reg and funds Transferred to mini pool.'
                    );
                  });
              });
          });
        });
      });
    });
  }); // End Test

  // Have the same initial user send an deposit again, to trigger the pool to go into countdown
  it(
    printTitle(
      'userFirst',
      'sends ether to RP again, their balance updates, first mini pool remains accepting deposits and only 1 reg user'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketUser now
          return rocketUser.deployed().then(rocketUserInstance => {
            // Get the min ether required to launch a mini pool
            return rocketSettingsInstance.getPoolMinEtherRequired.call().then(result => {
              // Transaction - Send Ether as a user, send enough not to trigger the pool to enter countdown status for launch
              const minDepositRequiredForLaunch = result.valueOf();
              const sendAmount = web3.toWei('1', 'ether');
              return rocketUserInstance
                .userDeposit('default', {
                  from: userFirst,
                  to: rocketUserInstance.address,
                  value: sendAmount,
                  gas: rocketDepositGas,
                })
                .then(result => {
                  // Now check the events
                  let userSendAmount = 0;
                  let userSendAddress = 0;
                  let userCount = 0;
                  let poolAddress = 0;
                  let poolStatus = null;
                  let poolBalance = 0;

                  result.logs.forEach(log => {
                    if (log.event == 'Transferred') {
                      userSendAmount = log.args.value;
                      userSendAddress = log.args._from;
                      poolAddress = log.args._to;
                    }
                  });

                  // Get the instance the prev mini pool
                  const miniPoolInstance = rocketPoolMini.at(poolAddress);
                  return miniPoolFirstInstance.getStatus.call().then(result => {
                    poolStatus = result.valueOf();
                    poolBalance = web3.eth.getBalance(miniPoolInstance.address).valueOf();
                    // Now just count the users to make sure this user wasn't added twice
                    return miniPoolInstance.getUserCount.call().then(result => {
                      userCount = result.valueOf();
                      // Now get the user
                      return miniPoolInstance.getUser
                        .call(userFirst)
                        .then(result => {
                          const user = result.valueOf();
                          const userBalance = result[1].valueOf();
                          // Now check everything
                          if (
                            userSendAmount == sendAmount &&
                            poolStatus == 0 &&
                            poolBalance > sendAmount &&
                            userCount == 1 &&
                            minDepositRequiredForLaunch - web3.toWei('1', 'ether') == userBalance
                          ) {
                            return true;
                          }
                          return false;
                        })
                        .then(result => {
                          assert.isTrue(
                            result,
                            'Funds transferred successfully, mini pool remains accepting deposits, user balance updated.'
                          );
                        });
                    });
                  });
                });
            });
          });
        });
      });
    }
  ); // End Test

  // Have a new user send an deposit, to trigger the pool to go into countdown
  it(
    printTitle('userSecond', 'sends ether to RP, first mini pool status changes to countdown and only 2 reg users'),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketUser now
          return rocketUser.deployed().then(rocketUserInstance => {
            // Get the min ether required to launch a mini pool
            return rocketSettingsInstance.getPoolMinEtherRequired.call().then(result => {
              // Transaction - Send Ether as a user, send enough not to trigger the pool to enter countdown status for launch
              const sendAmount = web3.toWei('5', 'ether');
              rocketUserInstance
                .userDeposit('default', {
                  from: userSecond,
                  to: rocketUserInstance.address,
                  value: sendAmount,
                  gas: rocketDepositGas,
                })
                .then(result => {
                  // Now check the events
                  let userSendAmount = 0;
                  let userSendAddress = 0;
                  let userCount = 0;
                  let poolAddress = 0;
                  let poolStatus = null;
                  let poolBalance = 0;

                  result.logs.forEach(log => {
                    if (log.event == 'Transferred') {
                      userSendAmount = log.args.value;
                      userSendAddress = log.args._from;
                      poolAddress = log.args._to;
                    }
                  });

                  // Get the instance the prev mini pool
                  const miniPoolInstance = rocketPoolMini.at(poolAddress);
                  return miniPoolFirstInstance.getStatus.call().then(result => {
                    poolStatus = result.valueOf();
                    poolBalance = web3.eth.getBalance(miniPoolInstance.address).valueOf();
                    // Now just count the users to make sure this user wasn't added twice
                    return miniPoolInstance.getUserCount
                      .call()
                      .then(result => {
                        userCount = result.valueOf();
                        // Now check everything
                        if (
                          userSendAmount == sendAmount &&
                          poolStatus == 1 &&
                          poolBalance > sendAmount &&
                          userCount == 2
                        ) {
                          return true;
                        }
                        return false;
                      })
                      .then(result => {
                        assert.isTrue(
                          result,
                          'Funds transferred successfully, mini pool moved to countdown status, user balance updated.'
                        );
                      });
                  });
                });
            });
          });
        });
      });
    }
  ); // End Test

  // Second user sets a backup withdrawal address
  it(
    printTitle('userSecond', 'registers a backup withdrawal address on their deposit while minipool is in countdown'),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketUser now
          return rocketUser.deployed().then(rocketUserInstance => {
            // Now set the backup address
            rocketUserInstance
              .userSetWithdrawalDepositAddress(userSecondBackupAddress, miniPoolFirstInstance.address, {
                from: userSecond,
                gas: 550000,
              })
              .then(result => {
                let newBackupAddress = 0;

                // Check the event log now
                result.logs.forEach(log => {
                  if (log.event == 'UserSetBackupWithdrawalAddress') {
                    newBackupAddress = log.args._userBackupAddress;
                  }
                });

                if (newBackupAddress == userSecondBackupAddress) {
                  return true;
                }
                return true;
              })
              .then(result => {
                assert.isTrue(result, 'Second user registered backup address');
              });
          });
        });
      });
    }
  );

  // Another user (partner user) sends a deposit and has a new pool accepting deposits created for them as the previous one is now in countdown to launch mode and not accepting deposits
  it(
    printTitle(
      'partnerFirst',
      'send ether to RP on behalf of their user, second mini pool is created for them and is accepting deposits'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketPool now
          return rocketPool.deployed().then(rocketPoolInstance => {
            // RocketUser now
            return rocketUser.deployed().then(rocketUserInstance => {
              // RocketPool api now
              return rocketPartnerAPI.deployed().then(rocketPartnerAPIInstance => {
                // Get the min ether required to launch a mini pool
                return rocketSettingsInstance.getPoolMinEtherRequired.call().then(result => {
                  // Transaction - Send Ether as a user, but send just enough to create the pool, but not launch it
                  const sendAmount = parseInt(result.valueOf()) - parseInt(web3.toWei('1', 'ether'));
                  // Deposit on a behalf of the partner and also specify the pool staking time ID
                  return rocketPartnerAPIInstance
                    .APIpartnerDeposit(partnerFirstUserAccount, 'default', {
                      from: partnerFirst,
                      value: sendAmount,
                      gas: rocketDepositGas,
                    })
                    .then(result => {
                      let poolAddress = 0;
                      let poolCreated = false;
                      let poolStatus = null;
                      let poolBalance = 0;
                      let userRegistered = false;
                      let userPartnerAddress = 0;

                      result.logs.forEach(log => {
                        if (log.event == 'APIpartnerDepositAccepted') {
                          userPartnerAddress = log.args._partner;
                        }
                      });

                      // Now find the pools our users belongs too, should just be one
                      return rocketPoolInstance.getPoolsFilterWithUser
                        .call(partnerFirstUserAccount, { from: partnerFirst })
                        .then(result => {
                          // Setup our checks
                          const userPools = result.valueOf();
                          // Get an instance of that pool and do further checks
                          const miniPoolInstance = rocketPoolMini.at(userPools[0]);
                          return miniPoolInstance.getStatus.call().then(result => {
                            // Status = 0? The default
                            poolStatus = result.valueOf();
                            poolBalance = web3.eth.getBalance(miniPoolInstance.address).valueOf();
                            // Now just count the users to make sure this user is the only one in this new pool
                            return miniPoolInstance.getUserCount
                              .call()
                              .then(result => {
                                userCount = result.valueOf();
                                // Now check everything
                                if (
                                  poolStatus == 0 &&
                                  poolBalance == sendAmount &&
                                  userPartnerAddress == partnerFirst &&
                                  userPools.length == 1
                                ) {
                                  return true;
                                }
                                return false;
                              })
                              .then(result => {
                                assert.isTrue(
                                  result,
                                  'Funds transferred successfully, mini pool created, user registered with partner and funds Transferred to mini pool.'
                                );
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
    }
  ); // End Test

  // First partner withdraws half their users previous Ether from the pool before it has launched for staking
  it(printTitle('partnerFirst', 'withdraws half their users previous deposit from the mini pool'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketUser now
        return rocketUser.deployed().then(rocketUserInstance => {
          // RocketPool api now
          return rocketPartnerAPI.deployed().then(rocketPartnerAPIInstance => {
            // RocketPool now
            return rocketPool.deployed().then(rocketPoolInstance => {
              // Get the users deposit total
              return rocketPoolInstance.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount).then(result => {
                const pools = result.valueOf();
                if (pools.length != 1) {
                  return false;
                }
                // Get an instance of that pool and do further checks
                const miniPoolInstance = rocketPoolMini.at(pools[0]);
                return miniPoolInstance.getStatus.call().then(result => {
                  // Get the pool status
                  const poolStatus = result.valueOf();
                  // Get the user deposit
                  return miniPoolInstance.getUserDeposit.call(partnerFirstUserAccount).then(result => {
                    const depositedAmount = result.valueOf();
                    const withdrawalAmount = depositedAmount / 2;
                    // Withdraw half our deposit now through the main parent contract
                    return rocketPartnerAPIInstance
                      .APIpartnerWithdrawal(miniPoolInstance.address, withdrawalAmount, partnerFirstUserAccount, {
                        from: partnerFirst,
                        gas: 4000000,
                      })
                      .then(result => {
                        // Get our balance again
                        return miniPoolInstance.getUserDeposit.call(partnerFirstUserAccount).then(result => {
                          const depositedAmountAfter = result.valueOf();
                          if (depositedAmountAfter == depositedAmount - withdrawalAmount) {
                            return true;
                          }
                          return false;
                        });
                      })
                      .then(result => {
                        assert.isTrue(
                          result,
                          'User has successfully withdrawn half of their balance from the mini pool.'
                        );
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

  // First partner user withdraws the remaining deposit from the mini pool, their user is removed from it and the mini pool is destroyed as it has no users anymore
  it(
    printTitle(
      'partnerFirst',
      'withdraws their users remaining deposit from the mini pool, their user is removed from it and the mini pool is destroyed as it has no users anymore'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketPool now
          return rocketPool.deployed().then(rocketPoolInstance => {
            // RocketPool api now
            return rocketPartnerAPI.deployed().then(rocketPartnerAPIInstance => {
              // Get the users deposit total
              return rocketPoolInstance.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount).then(result => {
                const pools = result.valueOf();
                if (pools.length != 1) {
                  return false;
                }
                // Get an instance of that pool and do further checks
                const miniPoolInstance = rocketPoolMini.at(pools[0]);
                return miniPoolInstance.getStatus.call().then(result => {
                  // Get the pool status
                  const poolStatus = result.valueOf();
                  // Get the user deposit
                  return miniPoolInstance.getUserDeposit.call(partnerFirstUserAccount).then(result => {
                    const depositedAmount = result.valueOf();
                    const withdrawalAmount = depositedAmount;
                    // Withdraw our deposit now through the main parent contract
                    return rocketPartnerAPIInstance
                      .APIpartnerWithdrawal(miniPoolInstance.address, withdrawalAmount, partnerFirstUserAccount, {
                        from: partnerFirst,
                        gas: rocketWithdrawalGas,
                      })
                      .then(result => {
                        // See if RocketHub still recognises the pool contract after its been removed and self destructed
                        return rocketPoolInstance.getPoolExists
                          .call(pools[0])
                          .then(result => {
                            // If the pool doesn't exist, success!
                            return result.valueOf() == true ? false : true;
                          })
                          .then(result => {
                            assert.isTrue(
                              result,
                              'User has successfully withdrawn their balance from the mini pool and has been removed from the pool.'
                            );
                          });
                      });
                  });
                });
              });
            });
          });
        });
      });
    }
  ); // End Test

  it(
    printTitle(
      'userThird',
      'sends a lot of ether to RP, creates second mini pool, registers user with pool and sets status of minipool to countdown'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketPool now
          return rocketPool.deployed().then(rocketPoolInstance => {
            // RocketUser now
            return rocketUser.deployed().then(rocketUserInstance => {
              // Get the min ether required to launch a mini pool
              return rocketSettingsInstance.getPoolMinEtherRequired.call().then(result => {
                // Transaction - Send Ether as a user, enough to create pool and set it into countdown
                const sendAmount = result.valueOf();
                return rocketUserInstance
                  .userDeposit('default', {
                    from: userThird,
                    to: rocketPoolInstance.address,
                    value: sendAmount,
                    gas: rocketDepositGas,
                  })
                  .then(result => {
                    // Now check the events
                    let userSendAmount = 0;
                    let userSendAddress = 0;
                    let userPartnerAddress = 0;
                    let userCount = 0;
                    let poolAddress = 0;
                    let poolStatus = null;
                    let poolBalance = 0;

                    result.logs.forEach(log => {
                      if (log.event == 'Transferred') {
                        userSendAmount = log.args.value;
                        userSendAddress = log.args._from;
                        poolAddress = log.args._to;
                      }
                    });

                    // Get an instance of that pool and do further checks
                    miniPoolSecondInstance = rocketPoolMini.at(poolAddress);
                    return miniPoolSecondInstance.getStatus.call().then(result => {
                      // Status = 0? The default
                      poolStatus = result.valueOf();
                      poolBalance = web3.eth.getBalance(miniPoolSecondInstance.address).valueOf();
                      return miniPoolSecondInstance.getUserPartner
                        .call(userThird)
                        .then(result => {
                          // Partner check
                          userPartnerAddress = result.valueOf();
                          // Now check everything
                          if (
                            poolStatus == 1 &&
                            poolBalance == sendAmount &&
                            userSendAmount > 0 &&
                            userPartnerAddress == 0
                          ) {
                            return true;
                          }
                          return false;
                        })
                        .then(result => {
                          assert.isTrue(
                            result,
                            'Funds transferred successfully, mini pool created, user reg and funds Transferred to mini pool.'
                          );
                        });
                    });
                  });
              });
            });
          });
        });
      });
    }
  ); // End Test

  // Attempt to make a withdraw of rocket deposit tokens too early
  it(printTitle('userThird', 'fail to withdraw Rocket Deposit Tokens before pool begins staking'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketUser now
        return rocketUser.deployed().then(rocketUserInstance => {
          // Try to withdraw tokens from that users minipool
          return rocketUserInstance
            .userWithdrawDepositTokens(miniPoolSecondInstance.address, 0, { from: userThird, gas: 150000 })
            .then(result => {
              return result;
            })
            .then(result => {
              assert(false, "Expect throw but didn't.");
            })
            .catch(error => {
              return checkThrow(error);
            });
        });
      });
    });
  }); // End Test

  // Node performs first checkin, no pools should be launched yet
  it(
    printTitle(
      'nodeFirst',
      'first node performs checkin, no mini pool awaiting launch should not be launched yet as the countdown has not passed for either'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return rocketNode.deployed().then(rocketNodeInstance => {
            // RocketPool now
            return rocketPool.deployed().then(rocketPoolInstance => {
              // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
              // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
              const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');
              // Checkin now
              return rocketNodeInstance
                .nodeCheckin(
                  averageLoad15mins, // Server Load
                  { from: nodeFirst, gas: nodeCheckinGas }
                )
                .then(result => {
                  let nodeAddress = 0;
                  let loadAverage = 0;

                  result.logs.forEach(log => {
                    if (log.event == 'NodeCheckin') {
                      // Did our node checkin ok?
                      nodeAddress = log.args._nodeAddress.valueOf();
                      loadAverage = log.args.loadAverage.valueOf();
                    }
                  });

                  // Check the node doesn't belong to any pools now
                  return rocketPoolInstance.getPoolsFilterWithNodeCount
                    .call(nodeAddress)
                    .then(result => {
                      const poolCount = result.valueOf();
                      // Check it
                      return nodeFirst == nodeAddress && loadAverage && poolCount == 0 ? true : false;
                    })
                    .then(result => {
                      assert.isTrue(result, 'Node has checked in successfully.');
                    });
                });
            });
          });
        });
      });
    }
  ); // End Test

  // Node performs second checkin, sets the launch time for mini pools to 0 so that the first awaiting mini pool is launched
  it(
    printTitle(
      'nodeFirst',
      'first node performs second checkin, 1 of the 2 minipools awaiting launch should be launched as countdown is set to 0 and balance sent to Casper'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketPool now
          return rocketPool.deployed().then(rocketPoolInstance => {
            // RocketNode now
            return rocketNode.deployed().then(rocketNodeInstance => {
              // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
              // Also Solidity doesn't deal with decimals atm, so convert to a whole number for the load
              const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');
              // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
              return rocketSettingsInstance
                .setPoolCountdownTime(0, { from: web3.eth.coinbase, gas: 500000 })
                .then(result => {
                  // Launching multiple pools at once can consume a lot of gas, estimate it first
                  return rocketNodeInstance.nodeCheckin
                    .estimateGas(averageLoad15mins, { from: nodeFirst })
                    .then(gasEstimate => {
                      // Checkin now
                      return rocketNodeInstance
                        .nodeCheckin(
                          averageLoad15mins, // Server Load
                          { from: nodeFirst, gas: parseInt(gasEstimate) + 100000 }
                        )
                        .then(result => {
                          let nodeCheckinOk = false;
                          const minipools = [];
                          const minipoolParams = {
                            address: 0,
                            instance: 0,
                            status: 0,
                            balance: 0,
                          };

                          result.logs.forEach(log => {
                            if (log.event == 'NodeCheckin') {
                              // Did our node checkin ok?
                              nodeCheckinOk =
                                log.args._nodeAddress == nodeFirst && log.args.loadAverage == averageLoad15mins
                                  ? true
                                  : false;
                            }
                          });

                          // Check that the first minipool contract has been attached to the node
                          return rocketPoolInstance.getPoolsFilterWithNode.call(nodeFirst).then(result => {
                            // Get minipools
                            const minipoolsAttached = result.valueOf();
                            // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                            const minipoolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                            // Update the pool info
                            return miniPoolFirstInstance.getStatus
                              .call()
                              .then(result => {
                                // Status = 2? Launched
                                const minipoolStatus = result.valueOf();
                                // Check it all now
                                return (
                                  minipoolsAttached.length == 1 &&
                                  minipoolsAttached[0] == miniPoolFirstInstance.address &&
                                  minipoolBalance == 0 &&
                                  minipoolStatus == 2 &&
                                  nodeCheckinOk == true
                                );
                              })
                              .then(result => {
                                assert.isTrue(
                                  result,
                                  'Node has checked in successfully and launched the first mini pool successfully.'
                                );
                              });
                          });
                        });
                    });
                });
            });
          });
        });
      });
    }
  ); // End Test

  // Node performs second checkin, sets the launch time for mini pools to 0 so that the second awaiting mini pool is launched
  it(
    printTitle(
      'nodeSecond',
      'second node performs first checkin, 2 of the 2 minipools awaiting launch should be launched as countdown is set to 0 and balance sent to Casper'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketPool now
          return rocketPool.deployed().then(rocketPoolInstance => {
            // RocketNode now
            return rocketNode.deployed().then(rocketNodeInstance => {
              // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
              // Also Solidity doesn't deal with decimals atm, so convert to a whole number for the load
              const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');
              // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
              return rocketSettingsInstance
                .setPoolCountdownTime(0, { from: web3.eth.coinbase, gas: 500000 })
                .then(result => {
                  // Launching multiple pools at once can consume a lot of gas, estimate it first
                  return rocketNodeInstance.nodeCheckin
                    .estimateGas(averageLoad15mins, { from: nodeSecond })
                    .then(gasEstimate => {
                      // Checkin now
                      return rocketNodeInstance
                        .nodeCheckin(
                          averageLoad15mins, // Server Load
                          { from: nodeSecond, gas: parseInt(gasEstimate) + 100000 }
                        )
                        .then(result => {
                          let nodeCheckinOk = false;
                          const minipools = [];
                          const minipoolParams = {
                            address: 0,
                            instance: 0,
                            status: 0,
                            balance: 0,
                          };

                          result.logs.forEach(log => {
                            if (log.event == 'NodeCheckin') {
                              // Did our node checkin ok?
                              nodeCheckinOk =
                                log.args._nodeAddress == nodeSecond && log.args.loadAverage == averageLoad15mins
                                  ? true
                                  : false;
                            }
                          });

                          // Check that the first minipool contract has been attached to the node
                          return rocketPoolInstance.getPoolsFilterWithNode.call(nodeSecond).then(result => {
                            // Get minipools
                            const minipoolsAttached = result.valueOf();
                            // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                            const minipoolBalance = web3.eth.getBalance(miniPoolSecondInstance.address).valueOf();
                            // Update the pool info
                            return miniPoolSecondInstance.getStatus
                              .call()
                              .then(result => {
                                // Status = 2? Launched
                                const minipoolStatus = result.valueOf();
                                // Check it all now
                                return (
                                  minipoolsAttached.length == 1 &&
                                  minipoolsAttached[0] == miniPoolSecondInstance.address &&
                                  minipoolBalance == 0 &&
                                  minipoolStatus == 2 &&
                                  nodeCheckinOk == true
                                );
                              })
                              .then(result => {
                                assert.isTrue(
                                  result,
                                  'Node has checked in successfully and launched the first mini pool successfully.'
                                );
                              });
                          });
                        });
                    });
                });
            });
          });
        });
      });
    }
  ); // End Test

  it(
    printTitle(
      'userThird',
      'withdraws 50% of their deposit as Rocket Deposit Tokens while their minipool is staking with Casper'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // Get the token withdrawal fee
          return rocketSettingsInstance.getDepositTokenWithdrawalFeePercInWei.call().then(result => {
            // Token fee
            const tokenWithdrawalFee = parseInt(result.valueOf());
            // Check rocketDepositToken is deployed
            return rocketDepositToken.deployed().then(rocketDepositTokenInstance => {
              // Get the total supply of tokens in circulation
              return rocketDepositTokenInstance.totalSupply.call({ from: userThird }).then(result => {
                const totalTokenSupply = parseInt(result.valueOf());
                // RocketUser now
                return rocketUser.deployed().then(rocketUserInstance => {
                  // Third user deposited the min required to launch a pool earlier, we need this amount so we can calculate 50%
                  return miniPoolSecondInstance.getUserDeposit.call(userThird).then(result => {
                    const withdrawHalfAmount = parseInt(result.valueOf()) / 2;
                    // Fee incurred on tokens
                    const tokenBalanceFeeIncurred = parseFloat(
                      web3.fromWei(tokenWithdrawalFee, 'ether') * web3.fromWei(withdrawHalfAmount, 'ether')
                    );
                    // Try to withdraw tokens from that users minipool
                    return rocketUserInstance
                      .userWithdrawDepositTokens(miniPoolSecondInstance.address, withdrawHalfAmount, {
                        from: userThird,
                        gas: 250000,
                      })
                      .then(result => {
                        // Get the total supply of tokens in circulation
                        return rocketDepositTokenInstance.totalSupply({ from: userThird }).then(result => {
                          const totalTokenSupplyAfter = web3.fromWei(parseInt(result.valueOf()), 'ether');
                          // Now count how many tokens that user has, should match the amount withdrawn
                          return rocketDepositTokenInstance.balanceOf.call(userThird).then(result => {
                            // Now count how many tokens that user has, should match the amount withdrawn - fees
                            const tokenBalance = parseFloat(web3.fromWei(result.valueOf(), 'ether'));
                            return miniPoolSecondInstance.getUserDeposit
                              .call(userThird)
                              .then(result => {
                                // The balance after withdrawing tokens
                                let userBalance = result.valueOf();
                                //console.log(tokenBalanceFeeIncurred, tokenBalance, (web3.fromWei(withdrawHalfAmount, 'ether') - tokenBalanceFeeIncurred), totalTokenSupplyAfter);
                                // Check everything
                                return tokenBalance ==
                                  web3.fromWei(withdrawHalfAmount, 'ether') - tokenBalanceFeeIncurred &&
                                  tokenBalance == totalTokenSupplyAfter &&
                                  userBalance == withdrawHalfAmount
                                  ? true
                                  : false;
                              })
                              .then(result => {
                                assert.isTrue(result, 'Users tokens do not match the amount withdrawn');
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
    }
  ); // End Test

  it(printTitle('userThird', 'transfers half of their deposit tokens to userFirst on the open market'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // Check rocketDepositToken is deployed
        return rocketDepositToken.deployed().then(rocketDepositTokenInstance => {
          // Now count how many tokens that user has
          return rocketDepositTokenInstance.balanceOf.call(userThird).then(result => {
            // Their token balance
            const userThirdTokenBalance = parseInt(result.valueOf());
            // Transfer half to first user on the open market
            const tokenTransferAmount = userThirdTokenBalance / 2;
            // Transfer now
            return rocketDepositTokenInstance
              .transfer(userFirst, tokenTransferAmount, { from: userThird, gas: 250000 })
              .then(result => {
                // Now count how many tokens that user has
                return rocketDepositTokenInstance.balanceOf.call(userThird).then(result => {
                  const userThirdTokenBalanceAfter = parseInt(result.valueOf());
                  // Now count first users
                  return rocketDepositTokenInstance.balanceOf
                    .call(userFirst)
                    .then(result => {
                      const userFirstTokenBalance = parseInt(result.valueOf());
                      return userThirdTokenBalanceAfter == userThirdTokenBalance - tokenTransferAmount &&
                        userFirstTokenBalance == tokenTransferAmount
                        ? true
                        : false;
                    })
                    .then(result => {
                      assert.isTrue(result, 'Users tokens do not match the amount transferred');
                    });
                });
              });
          });
        });
      });
    });
  }); // End Test

  it(printTitle('userThird', 'fails to transfer more tokens than they own on the open market'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // Check rocketDepositToken is deployed
        return rocketDepositToken.deployed().then(rocketDepositTokenInstance => {
          // Now count how many tokens that user has
          return rocketDepositTokenInstance.balanceOf.call(userThird).then(result => {
            // Their token balance
            const userThirdTokenBalance = parseInt(result.valueOf());
            // Transfer to first user on the open market
            const tokenTransferAmount = userThirdTokenBalance + 10000;
            // Transfer now
            return rocketDepositTokenInstance
              .transfer(userFirst, tokenTransferAmount, { from: userThird, gas: 250000 })
              .then(result => {
                // Now count how many tokens that user has
                return rocketDepositTokenInstance.balanceOf
                  .call(userThird)
                  .then(result => {
                    const userThirdTokenBalanceAfter = parseInt(result.valueOf());
                    // Check they didn't send any
                    return userThirdTokenBalance == userThirdTokenBalanceAfter ? true : false;
                  })
                  .then(result => {
                    assert.isTrue(result, 'Users tokens were transferred');
                  });
              });
          });
        });
      });
    });
  }); // End Test

  it(
    printTitle('userThird', 'fails to transfer tokens from userFirst account to themselves on the open market'),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // Check rocketDepositToken is deployed
          return rocketDepositToken.deployed().then(rocketDepositTokenInstance => {
            // Now count how many tokens that user has
            return rocketDepositTokenInstance.balanceOf.call(userFirst).then(result => {
              // Their token balance
              const userFirstTokenBalance = parseInt(result.valueOf());
              // Transfer to third user on the open market
              const tokenTransferAmount = userFirstTokenBalance / 2;
              // Transfer now
              return rocketDepositTokenInstance
                .transferFrom(userFirst, userThird, tokenTransferAmount, { from: userThird, gas: 250000 })
                .then(result => {
                  // Now count how many tokens that user has
                  return rocketDepositTokenInstance.balanceOf
                    .call(userFirst)
                    .then(result => {
                      const userFirstTokenBalanceAfter = parseInt(result.valueOf());
                      // Check they didn't send any
                      return userFirstTokenBalance == userFirstTokenBalanceAfter ? true : false;
                    })
                    .then(result => {
                      assert.isTrue(result, 'Users tokens were transferred');
                    });
                });
            });
          });
        });
      });
    }
  ); // End Test

  it(
    printTitle(
      'userThird',
      'fails to trade their tokens for ether in the rocket deposit token fund as it does not have enough ether to cover the amount sent'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // Check rocketDepositToken is deployed
          return rocketDepositToken.deployed().then(rocketDepositTokenInstance => {
            // Now count how many tokens that user has
            return rocketDepositTokenInstance.balanceOf.call(userThird).then(result => {
              // Their token balance
              const userThirdTokenBalance = parseInt(result.valueOf());
              // Transfer now
              return rocketDepositTokenInstance
                .burnTokensForEther(userThirdTokenBalance, { from: userThird, gas: 250000 })
                .then(result => {
                  return result;
                })
                .then(result => {
                  assert(false, "Expect throw but didn't.");
                })
                .catch(error => {
                  return checkThrow(error);
                });
            });
          });
        });
      });
    }
  ); // End Test

  it(
    printTitle(
      'userThird',
      'withdraws the remainder of their deposit as Rocket Deposit Tokens while their minipool is staking with Casper and are removed from pool'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // Get the token withdrawal fee
          return rocketSettingsInstance.getDepositTokenWithdrawalFeePercInWei.call().then(result => {
            // Token fee
            const tokenWithdrawalFee = parseInt(result.valueOf());
            // Check rocketDepositToken is deployed
            return rocketDepositToken.deployed().then(rocketDepositTokenInstance => {
              // RocketUser now
              return rocketUser.deployed().then(rocketUserInstance => {
                // Withdraw all by passing 0
                return rocketUserInstance
                  .userWithdrawDepositTokens(miniPoolSecondInstance.address, 0, { from: userThird, gas: 250000 })
                  .then(result => {
                    // User should be removed from pool now as they dont have any deposit left, they traded it all for deposit tokens
                    // Will throw if user doesn't exist in pool
                    return miniPoolSecondInstance.getUserDeposit
                      .call(userThird)
                      .then(result => {
                        return result;
                      })
                      .then(result => {
                        assert(false, "Expect throw but didn't.");
                      })
                      .catch(error => {
                        return checkThrow(error);
                      });
                  });
              });
            });
          });
        });
      });
    }
  ); // End Test

  // First user with deposit staking in minipool attempts to withdraw deposit before staking has finished
  it(printTitle('userFirst', 'user fails to withdraw deposit while minipool is staking'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketUser now
        return rocketUser.deployed().then(rocketUserInstance => {
          // Attemp withdrawal of all our deposit now
          return rocketUserInstance
            .userWithdraw(miniPoolFirstInstance.address, 0, { from: userFirst, gas: rocketWithdrawalGas })
            .then(resul => {
              return result;
            })
            .then(result => {
              assert(false, "Expect throw but didn't.");
            })
            .catch(error => {
              return checkThrow(error);
            });
        });
      });
    });
  }); // End Test

  // Node performs checkin
  it(
    printTitle(
      'nodeFirst',
      'first node performs another checkin, first mini pool currently staking should remain staking on it'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return rocketNode.deployed().then(rocketNodeInstance => {
            const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');
            // Checkin now
            return rocketNodeInstance
              .nodeCheckin(
                averageLoad15mins, // Server Load
                { from: nodeFirst, gas: nodeCheckinGas }
              )
              .then(result => {
                return miniPoolFirstInstance.getStatus.call().then(result => {
                  // Status = 2? Still staking
                  miniPoolStatus = result.valueOf();
                  // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                  miniPoolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                  // Ok Check it all now
                  return miniPoolStatus == 2 && miniPoolBalance == 0 ? true : false;
                });
              })
              .then(result => {
                assert.isTrue(result, 'Node has checked in successfully.');
              });
          });
        });
      });
    }
  ); // End Test

  // Update first mini pool
  it(printTitle('---------', 'first mini pool has staking duration set to 0'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketPool now
        return rocketPool.deployed().then(rocketPoolInstance => {
          // Set the mini pool staking duration to 0 for testing so it will attempt to request withdrawal from Casper
          rocketPoolInstance
            .setPoolStakingDuration(miniPoolFirstInstance.address, 0, { from: owner, gas: 150000 })
            .then(result => {
              return true;
            })
            .then(result => {
              assert.isTrue(result, 'First mini pool has staking duration set to 0.');
            });
        });
      });
    });
  }); // End Test

  // Update second mini pool
  it(printTitle('---------', 'second mini pool has staking duration set to 0'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketPool now
        return rocketPool.deployed().then(rocketPoolInstance => {
          // Set the mini pool staking duration to 0 for testing so it will attempt to request withdrawal from Casper
          rocketPoolInstance
            .setPoolStakingDuration(miniPoolSecondInstance.address, 0, { from: owner, gas: 150000 })
            .then(result => {
              return true;
            })
            .then(result => {
              assert.isTrue(result, 'Second mini pool has staking duration set to 0.');
            });
        });
      });
    });
  }); // End Test

  // Node performs checkin
  it(
    printTitle(
      'nodeFirst',
      'first node performs another checkin after both minipools have staking duration set to 0. Only minipool attached to first node will signal awaiting withdrawal from Casper.'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return rocketNode.deployed().then(rocketNodeInstance => {
            const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');
            // Checkin now
            return rocketNodeInstance
              .nodeCheckin(averageLoad15mins, { from: nodeFirst, gas: nodeCheckinGas })
              .then(result => {
                return miniPoolFirstInstance.getStatus
                  .call()
                  .then(result => {
                    // Status = 3? Awaiting withdrawal from Casper
                    const miniPoolStatusFirst = result.valueOf();
                    return miniPoolSecondInstance.getStatus.call().then(result => {
                      // Status = 3? Awaiting withdrawal from Casper
                      const miniPoolStatusSecond = result.valueOf();
                      // Ok Check it all now
                      return miniPoolStatusFirst == 3 && miniPoolStatusSecond == 2 ? true : false;
                    });
                  })
                  .then(result => {
                    assert.isTrue(result, 'Node has checked in successfully.');
                  });
              });
          });
        });
      });
    }
  ); // End Test

  // Node performs checkin
  it(
    printTitle(
      'nodeSecond',
      'second node performs another checkin after both minipools have staking duration set to 0. Only minipool attached to second node will signal awaiting withdrawal from Casper.'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return rocketNode.deployed().then(rocketNodeInstance => {
            const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');
            // Checkin now
            return rocketNodeInstance
              .nodeCheckin(averageLoad15mins, { from: nodeSecond, gas: nodeCheckinGas })
              .then(result => {
                return miniPoolFirstInstance.getStatus
                  .call()
                  .then(result => {
                    // Status = 3? Awaiting withdrawal from Casper
                    const miniPoolStatusFirst = result.valueOf();
                    return miniPoolSecondInstance.getStatus.call().then(result => {
                      // Status = 3? Awaiting withdrawal from Casper
                      const miniPoolStatusSecond = result.valueOf();
                      // Ok Check it all now
                      return miniPoolStatusFirst == 3 && miniPoolStatusSecond == 3 ? true : false;
                    });
                  })
                  .then(result => {
                    assert.isTrue(result, 'Node has checked in successfully.');
                  });
              });
          });
        });
      });
    }
  ); // End Test

  // Update first mini pool withdrawal epoch in casper
  it(
    printTitle(
      '---------',
      'first mini pool has its withdrawal epoc within Casper set to 0 to allow it to ask Casper for final withdrawal'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return casper.deployed().then(casperInstance => {
          // Set the withdrawal request to a week ago
          const newWithdrawalEpoch = Math.round(new Date().getTime() / 1000) - 604800;
          return casperInstance
            .setWithdrawalEpoch(miniPoolFirstInstance.address, newWithdrawalEpoch, { from: owner, gas: 150000 })
            .then(result => {
              // Now get it to check its been updated
              return casperInstance.getWithdrawalEpoch
                .call(miniPoolFirstInstance.address, { from: owner })
                .then(result => {
                  if (result && result.valueOf() == newWithdrawalEpoch) {
                    return true;
                  }
                  return false;
                })
                .then(result => {
                  assert.isTrue(result, 'First mini pool has its withdrawal epoc within Casper set to 0');
                });
            });
        });
      });
    }
  ); // End Test

  // Update second mini pool withdrawal epoch in casper
  it(
    printTitle(
      '---------',
      'second mini pool has its withdrawal epoc within Casper set to 0 to allow it to ask Casper for final withdrawal'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return casper.deployed().then(casperInstance => {
          // Set the withdrawal request to a week ago
          const newWithdrawalEpoch = Math.round(new Date().getTime() / 1000) - 604800;
          return casperInstance
            .setWithdrawalEpoch(miniPoolSecondInstance.address, newWithdrawalEpoch, { from: owner, gas: 150000 })
            .then(result => {
              // Now get it to check its been updated
              return casperInstance.getWithdrawalEpoch
                .call(miniPoolSecondInstance.address, { from: owner })
                .then(result => {
                  if (result && result.valueOf() == newWithdrawalEpoch) {
                    return true;
                  }
                  return false;
                })
                .then(result => {
                  assert.isTrue(result, 'Second mini pool has its withdrawal epoc within Casper set to 0');
                });
            });
        });
      });
    }
  ); // End Test

  // Node performs checkin
  it(
    printTitle(
      'nodeFirst',
      'first node performs another checkin and first mini pool to change status and request actual deposit withdrawal from Casper'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return rocketNode.deployed().then(rocketNodeInstance => {
            // Our average load (simplified) is determined by average load / CPU cores since it is relative to how many cores there are in a system
            // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
            const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');
            // Checkin now
            return rocketNodeInstance.nodeCheckin(averageLoad15mins, { from: nodeFirst, gas: 950000 }).then(result => {
              return miniPoolFirstInstance.getStatus.call().then(result => {
                // Status = 4? Received deposit from casper + rewards
                const miniPoolStatusFirst = result.valueOf();
                // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                const miniPoolBalanceFirst = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                // Check second pool
                return miniPoolSecondInstance.getStatus
                  .call()
                  .then(result => {
                    // Status = 4? Received deposit from casper + rewards
                    const miniPoolStatusSecond = result.valueOf();
                    // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                    const miniPoolBalanceSecond = web3.eth.getBalance(miniPoolSecondInstance.address).valueOf();
                    //console.log(miniPoolStatusFirst, miniPoolBalanceFirst);
                    //console.log(miniPoolStatusSecond, miniPoolBalanceSecond);
                    // Ok Check it all now
                    // second minipool was automatically closed when receiving deposit from Casper
                    // as all its users had been removed when taking their entire deposit out as tokens
                    return miniPoolStatusFirst == 4 &&
                      miniPoolBalanceFirst > 0 &&
                      (miniPoolStatusSecond == 3 && miniPoolBalanceSecond == 0)
                      ? true
                      : false;
                  })
                  .then(result => {
                    assert.isTrue(result, 'Status changed successfully and deposit received from Casper');
                  });
              });
            });
          });
        });
      });
    }
  ); // End Test

  // Node performs checkin
  it(
    printTitle(
      'nodeFirst',
      'first node performs another checkin and second mini pool requests deposit from Casper, receives it then closes the pool as all users have withdrawn deposit as tokens'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return rocketNode.deployed().then(rocketNodeInstance => {
            // Our average load (simplified) is determined by average load / CPU cores since it is relative to how many cores there are in a system
            // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
            const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');
            // Checkin now
            return rocketNodeInstance.nodeCheckin(averageLoad15mins, { from: nodeFirst, gas: 950000 }).then(result => {
              return miniPoolFirstInstance.getStatus.call().then(result => {
                // Status = 4? Received deposit from casper + rewards
                const miniPoolStatusFirst = result.valueOf();
                // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                const miniPoolBalanceFirst = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                // Check second pool
                return miniPoolSecondInstance.getStatus
                  .call()
                  .then(result => {
                    // Status = 4? Received deposit from casper + rewards
                    const miniPoolStatusSecond = result.valueOf();
                    // Get the balance, should be 0 as the Ether has been sent to Casper for staking
                    const miniPoolBalanceSecond = web3.eth.getBalance(miniPoolSecondInstance.address).valueOf();
                    //console.log(miniPoolSecondInstance.address);
                    //console.log(miniPoolStatusFirst, miniPoolBalanceFirst);
                    //console.log(miniPoolStatusSecond, miniPoolBalanceSecond);
                    // Ok Check it all now
                    // second minipool was automatically closed when receiving deposit from Casper
                    // as all its users had been removed when taking their entire deposit out as tokens
                    return miniPoolStatusFirst == 4 &&
                      miniPoolBalanceFirst > 0 &&
                      (miniPoolStatusSecond == 0 && miniPoolBalanceSecond == 0)
                      ? true
                      : false;
                  })
                  .then(result => {
                    assert.isTrue(result, 'Status changed successfully and deposit received from Casper');
                  });
              });
            });
          });
        });
      });
    }
  ); // End Test

  it(
    printTitle('---------', 'all of userThirds withdrawn token backed ethers should be in the deposit token fund now'),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketUser now
          return rocketUser.deployed().then(rocketUserInstance => {
            // Get the min ether required to launch a mini pool - the user sent half this amount for tokens originally
            return rocketSettingsInstance.getPoolMinEtherRequired.call().then(result => {
              // These ethers are ones they withdrew tokens against
              const etherAmountTradedSentForTokens = parseInt(result.valueOf());
              // Check rocketDepositToken is deployed
              return rocketDepositToken.deployed().then(rocketDepositTokenInstance => {
                // Now count how many tokens that user has
                return rocketDepositTokenInstance.balanceOf
                  .call(userThird)
                  .then(result => {
                    const depositTokenFundBalance = web3.eth.getBalance(rocketDepositTokenInstance.address).valueOf();
                    // Ok?
                    return depositTokenFundBalance == etherAmountTradedSentForTokens ? true : false;
                  })
                  .then(result => {
                    assert.isTrue(result, 'depositTokenFundBalance does not match etherAmountTradedSentForTokens');
                  });
              });
            });
          });
        });
      });
    }
  ); // End Test

  it(printTitle('userFirst', 'burns their deposit tokens received from userThird in return for ether + bonus'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // Check rocketDepositToken is deployed
        return rocketDepositToken.deployed().then(rocketDepositTokenInstance => {
          // Get the token withdrawal fee
          return rocketSettingsInstance.getDepositTokenWithdrawalFeePercInWei.call().then(result => {
            // Token fee - this goes to the person who trades the tokens back in
            const tokenWithdrawalFee = parseFloat(web3.fromWei(result.valueOf(), 'ether'));
            // Get the total supply of tokens in circulation
            return rocketDepositTokenInstance.totalSupply.call().then(result => {
              const fundTokenBalance = parseFloat(result.valueOf());
              //console.log(result.valueOf());
              //console.log(web3.fromWei(fundTokenBalance, 'ether'));
              // Now count how many tokens that user has
              return rocketDepositTokenInstance.balanceOf.call(userFirst).then(result => {
                // Their token balance
                const userFirstTokenBalance = parseFloat(result.valueOf());
                const userFirstEtherBalance = web3.eth.getBalance(userFirst).valueOf();
                const burnGas = 250000;
                // console.log(web3.fromWei(userFirstTokenBalance, 'ether'), web3.fromWei(userFirstEtherBalance, 'ether'));
                // Transfer now
                return rocketDepositTokenInstance
                  .burnTokensForEther(userFirstTokenBalance, { from: userFirst, gas: burnGas })
                  .then(result => {
                    // Now count how many tokens that user has, should be none
                    return rocketDepositTokenInstance.balanceOf.call(userFirst).then(result => {
                      const userFirstTokenBalanceAfter = parseFloat(result.valueOf());
                      const userFirstEtherBalanceAfter = web3.eth.getBalance(userFirst).valueOf();
                      // Now check the tokens were burnt
                      return rocketDepositTokenInstance.totalSupply
                        .call()
                        .then(result => {
                          const fundTokenBalanceAfter = parseFloat(result.valueOf());
                          const etherAccountDiff = userFirstEtherBalanceAfter - userFirstEtherBalance;
                          // const etherAccountTradeWithBonus = (userFirstTokenBalance * (parseFloat(tokenWithdrawalFee + 1)));
                          // Now check
                          return userFirstTokenBalanceAfter == 0 &&
                            fundTokenBalanceAfter == parseFloat(fundTokenBalance) - parseFloat(userFirstTokenBalance) &&
                            etherAccountDiff > 0
                            ? true
                            : false;
                        })
                        .then(result => {
                          assert.isTrue(result, 'Users tokens do not match the amount transferred');
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
  it(
    printTitle('owner', 'fails to remove first node from the Rocket Pool network as it has mini pools attached to it'),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return rocketNode.deployed().then(rocketNodeInstance => {
            // Remove the node now
            return rocketNodeInstance
              .nodeRemove(nodeFirst, { from: owner, gas: 200000 })
              .then(result => {
                return result;
              })
              .then(result => {
                assert(false, "Expect throw but didn't.");
              })
              .catch(error => {
                return checkThrow(error);
              });
          });
        });
      });
    }
  ); // End Test

  // First user withdraws their deposit + rewards and pays Rocket Pools fee
  it(printTitle('userFirst', 'withdraws their deposit + casper rewards from the mini pool and pays their fee'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketUser now
        return rocketUser.deployed().then(rocketUserInstance => {
          // Get the user deposit
          return miniPoolFirstInstance.getUserDeposit.call(userFirst).then(result => {
            // The balance before withdrawing
            const depositedAmount = result.valueOf();
            // Fee acount is the coinbase by default
            const rpFeeAccountBalancePrev = web3.eth.getBalance(owner).valueOf();
            // Get the mini pool balance
            const miniPoolBalancePrev = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
            // Withdraw our total deposit + rewards
            return rocketUserInstance
              .userWithdraw(miniPoolFirstInstance.address, 0, { from: userFirst, gas: rocketWithdrawalGas })
              .then(result => {
                let amountSentToUser = 0;
                // Go through our events
                result.logs.forEach(log => {
                  if (log.event == 'Transferred') {
                    amountSentToUser = log.args.value;
                  }
                });

                // Fee acount is the coinbase by default
                const rpFeeAccountBalance = web3.eth.getBalance(owner).valueOf();
                // Get the mini pool balance
                const miniPoolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                // Now just count the users to make sure this user has been removed after withdrawing their balance and paying the fee
                return miniPoolFirstInstance.getUserCount.call().then(result => {
                  const userCount = result.valueOf();
                  // Ok see if their account has been accredited with their deposit + rewards
                  if (
                    depositedAmount < amountSentToUser &&
                    userCount == 1 &&
                    rpFeeAccountBalance > rpFeeAccountBalancePrev &&
                    miniPoolBalance < miniPoolBalancePrev
                  ) {
                    return true;
                  }
                  return false;
                });
              })
              .then(result => {
                assert.isTrue(result, 'User has successfully withdrawn their final balance from the mini pool.');
              });
          });
        });
      });
    });
  }); // End Test

  // Second user attempts to withdraw using their backup address before the time limit to do so is allowed (3 months by default)
  it(
    printTitle('userSecond', 'fails to withdraw using their backup address before the time limit to do so is allowed'),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketUser now
          return rocketUser.deployed().then(rocketUserInstance => {
            // Attempt tp withdraw our total deposit + rewards using our backup address
            return rocketUserInstance
              .userWithdraw(miniPoolFirstInstance.address, 0, {
                from: userSecondBackupAddress,
                gas: rocketWithdrawalGas,
              })
              .then(result => {
                //console.log(result.logs);
                return result;
              })
              .then(result => {
                assert(false, "Expect throw but didn't.");
              })
              .catch(error => {
                return checkThrow(error);
              });
          });
        });
      });
    }
  ); // End Test

  // Update first mini pool
  it(
    printTitle(
      '---------',
      'settings BackupCollectTime changed to 0 which will allow the user to withdraw via their backup address'
    ),
    () => {
      /// Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketUser now
          return rocketUser.deployed().then(rocketUserInstance => {
            // Set the backup withdrawal period to 0 to allow the user to withdraw using their backup address
            rocketSettingsInstance
              .setPoolUserBackupCollectTime(0, { from: owner, gas: 150000 })
              .then(result => {
                return true;
              })
              .then(result => {
                assert.isTrue(result, 'settings BackupCollectTime changed to 0.');
              });
          });
        });
      });
    }
  ); // End Test

  // First user attempts to withdraw again
  it(printTitle('userFirst', "fails to withdraw again from the pool as they've already completed withdrawal"), () => {
    /// Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketUser now
        return rocketUser.deployed().then(rocketUserInstance => {
          // Attempt tp withdraw our total deposit + rewards using our backup address
          return rocketUserInstance
            .userWithdraw(miniPoolFirstInstance.address, 0, { from: userFirst, gas: rocketWithdrawalGas })
            .then(result => {
              return result;
            })
            .then(result => {
              assert(false, "Expect throw but didn't.");
            })
            .catch(error => {
              return checkThrow(error);
            });
        });
      });
    });
  }); // End Test

  // Second user withdraws their deposit + rewards and pays Rocket Pools fee, mini pool closes
  it(
    printTitle(
      'userSecond',
      'withdraws their deposit + casper rewards using their backup address from the mini pool, pays their fee and the pool closes'
    ),
    () => {
      // Check RocketStorage is deployed first
      return rocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return rocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketUser now
          return rocketUser.deployed().then(rocketUserInstance => {
            // RocketPool now
            return rocketPool.deployed().then(rocketPoolInstance => {
              // Get the user deposit
              return miniPoolFirstInstance.getUserDeposit.call(userSecond).then(result => {
                // The balance before withdrawing
                const depositedAmount = result.valueOf();
                // Fee acount is the coinbase by default
                const rpFeeAccountBalancePrev = web3.eth.getBalance(owner).valueOf();
                // Get the mini pool balance
                const miniPoolBalancePrev = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                // Withdraw our total deposit + rewards
                return rocketUserInstance
                  .userWithdraw(miniPoolFirstInstance.address, 0, {
                    from: userSecondBackupAddress,
                    gas: rocketWithdrawalGas,
                  })
                  .then(result => {
                    let amountSentToUser = 0;

                    // Go through our events
                    result.logs.forEach(log => {
                      if (log.event == 'Transferred') {
                        amountSentToUser = log.args.value;
                      }
                    });

                    // Fee acount is the coinbase by default
                    const rpFeeAccountBalance = web3.eth.getBalance(owner).valueOf();
                    // Get the mini pool balance
                    const miniPoolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
                    // See if RocketHub still recognises the pool contract after its been removed and self destructed
                    return rocketPoolInstance.getPoolExists
                      .call(miniPoolFirstInstance.address)
                      .then(result => {
                        const poolExists = result.valueOf();
                        // Ok see if their account has been accredited with their deposit + rewards
                        if (
                          depositedAmount < amountSentToUser &&
                          poolExists == false &&
                          rpFeeAccountBalance > rpFeeAccountBalancePrev &&
                          miniPoolBalance == 0
                        ) {
                          return true;
                        }
                        return false;
                      })
                      .then(result => {
                        assert.isTrue(
                          result,
                          'User has successfully withdrawn their final balance from the mini pool to their backup address and pool is now closed'
                        );
                      });
                  });
              });
            });
          });
        });
      });
    }
  ); // End Test

  // Owner removes first node
  it(printTitle('owner', 'removes first node from the Rocket Pool network'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketNode is deployed
      return rocketNode.deployed().then(rocketNodeInstance => {
        // RocketPool now
        return rocketPool.deployed().then(rocketPoolInstance => {
          // Remove the node now
          return rocketNodeInstance
            .nodeRemove(nodeFirst, { from: owner, gas: 200000 })
            .then(result => {
              let nodeAddress = null;

              // Go through our events
              result.logs.forEach(log => {
                if (log.event == 'NodeRemoved') {
                  // Did our node get removed ok?
                  nodeAddress = log.args._address;
                }
              });

              if (nodeAddress == nodeFirst) {
                return true;
              }
              return false;
            })
            .then(result => {
              assert.isTrue(result, 'Owner has successfully removed the node from the Rocket network');
            });
        });
      });
    });
  }); // End Test

  // Owner removes first partner - users attached to this partner can still withdraw
  it(printTitle('owner', 'removes first partner from the Rocket Pool network'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketPool now
        return rocketPool.deployed().then(rocketPoolInstance => {
          // RocketPool api now
          return rocketPartnerAPI.deployed().then(rocketPartnerAPIInstance => {
            // Now check the second partner array index
            return rocketPartnerAPIInstance.getPartnerIndex.call(partnerSecond).then(result => {
              // Record the index to see if it updates correctly after removing the first partner
              const partnerSecondIndexPrev = result.valueOf();
              // Remove the node now
              return rocketPartnerAPIInstance.partnerRemove(partnerFirst, { from: owner, gas: 500000 }).then(result => {
                let partnerAddress = null;

                // Go through our events
                result.logs.forEach(log => {
                  if (log.event == 'PartnerRemoved') {
                    // Did our partner get removed ok?
                    partnerAddress = log.args._address;
                  }
                });

                // The partner count should be one now
                return rocketPartnerAPIInstance.getPartnerCount.call().then(result => {
                  const partnerCount = result.valueOf();
                  // Now check the remaining partner array was reindexed correctly using the key/value storage
                  return rocketPartnerAPIInstance.getPartnerIndex
                    .call(partnerSecond)
                    .then(result => {
                      const partnerSecondIndex = result.valueOf();
                      // Check it all
                      return (
                        partnerAddress == partnerFirst &&
                        partnerCount == 1 &&
                        partnerSecondIndex == 0 &&
                        partnerSecondIndexPrev == 1
                      );
                    })
                    .then(result => {
                      assert.isTrue(result, 'Owner has successfully removed the partner from the Rocket network');
                    });
                });
              });
            });
          });
        });
      });
    });
  }); // End Test

  // Attempt to make a deposit with after being removed as a partner
  it(printTitle('partnerFirst', 'attempt to make a deposit with after being removed as a partner'), () => {
    // Check RocketStorage is deployed first
    return rocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return rocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketPool now
        return rocketPool.deployed().then(rocketPoolInstance => {
          // RocketPool api now
          return rocketPartnerAPI.deployed().then(rocketPartnerAPIInstance => {
            // Get the min ether required to launch a mini pool
            return rocketSettingsInstance.getPoolMinEtherRequired.call().then(result => {
              // Transaction - Send Ether as a user, but send just enough to create the pool, but not launch it
              const sendAmount = result.valueOf() - web3.toWei('1', 'ether');
              // Deposit on a behalf of the partner and also specify a incorrect pool staking time ID
              return rocketPartnerAPIInstance
                .APIpartnerDeposit(partnerFirstUserAccount, 'default', {
                  from: partnerFirst,
                  value: sendAmount,
                  gas: rocketDepositGas,
                })
                .then(result => {
                  return result;
                })
                .then(result => {
                  assert(false, "Expect throw but didn't.");
                })
                .catch(error => {
                  return checkThrow(error);
                });
            });
          });
        });
      });
    });
  }); // End Test
});
