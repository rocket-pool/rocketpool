const os = require('os');

const RocketUser = artifacts.require('./contract/RocketUser');
const RocketNode = artifacts.require('./contract/RocketNode');
const RocketPool = artifacts.require('./contract/RocketPool');
const RocketPoolMini = artifacts.require('./contract/RocketPoolMini');
const RocketDepositToken = artifacts.require('./contract/RocketDepositToken');
const RocketPartnerAPI = artifacts.require('./contract/RocketPartnerAPI');
const RocketSettings = artifacts.require('./contract/RocketSettings');
const RocketStorage = artifacts.require('./contract/RocketStorage');
const Casper = artifacts.require('./contract/Casper/DummyCasper');

const displayEvents = false;

// Display events triggered during the tests
if (displayEvents) {
  RocketPool.deployed().then(rocketPoolInstance => {
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
            const poolInstance = RocketPoolMini.at(result.args._address);
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

const assertThrows = async (promise, err) => {
  try {
    await promise;
    assert.isNotOk(true, err);
  } catch (e) {
    assert.include(e.message, 'VM Exception');
  }
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

  // Mocks partner accounts
  const partnerFirst = accounts[5];
  const partnerFirstName = 'Coinbase';
  const partnerFirstUserAccount = accounts[6];
  const partnerSecond = accounts[7];
  const partnerSecondName = 'MEW';
  const partnerRegisterGas = 200000;

  // Minipools
  let miniPoolFirstInstance;
  let miniPoolSecondInstance;

  // Contracts
  let rocketStorage;
  let rocketSettings;
  let rocketUser;
  let rocketNode;
  let rocketDeposit;
  let rocketPool;
  let rocketPartnerAPI;

  beforeEach(async () => {
    rocketStorage = await RocketStorage.deployed();
    rocketSettings = await RocketSettings.deployed();
    rocketUser = await RocketUser.deployed();
    rocketNode = await RocketNode.deployed();
    rocketDeposit = await RocketDepositToken.deployed();
    rocketPool = await RocketPool.deployed();
    rocketPartnerAPI = await RocketPartnerAPI.deployed();
  });

  // Owners direct access to storage is removed after initialisation when deployed
  it(printTitle('owner', 'fail to access storage directly after deployment'), async () => {
    const result = rocketStorage.setBool(web3.sha3('test.access'), true, { from: owner, gas: 250000 });
    await assertThrows(result);
  });

  // Try to register a node as a non rocket pool owner
  it(printTitle('non owner', 'fail to register a node'), async () => {
    const result = rocketNode.nodeAdd(nodeFirst, nodeFirstOracleID, nodeFirstInstanceID, {
      from: userFirst,
      gas: nodeRegisterGas,
    });
    await assertThrows(result);
  });

  // Register 2 nodes
  it(printTitle('owner', 'register 2 nodes'), async () => {
    await rocketNode.nodeAdd(nodeFirst, nodeFirstOracleID, nodeFirstInstanceID, { from: owner, gas: nodeRegisterGas });
    await rocketNode.nodeAdd(nodeSecond, nodeSecondOracleID, nodeSecondInstanceID, {
      from: owner,
      gas: nodeRegisterGas,
    });
    const result = await rocketNode.getNodeCount.call();
    assert.equal(result.valueOf(), 2, '2 Nodes registered successfully by owner');
  });

  // Try to register a new partner as a non rocket pool owner
  it(printTitle('non owner', 'fail to register a partner'), async () => {
    const result = rocketPartnerAPI.partnerAdd(partnerFirst, partnerFirstName, {
      from: userFirst,
      gas: partnerRegisterGas,
    });
    await assertThrows(result);
  });

  // Register two 3rd party partners
  it(printTitle('owner', 'register 2 partners'), async () => {
    await rocketPartnerAPI.partnerAdd(partnerFirst, partnerFirstName, {
      from: web3.eth.coinbase,
      gas: partnerRegisterGas,
    });
    await rocketPartnerAPI.partnerAdd(partnerSecond, partnerSecondName, {
      from: web3.eth.coinbase,
      gas: partnerRegisterGas,
    });

    const result = await rocketPartnerAPI.getPartnerCount.call();
    assert.equal(result.valueOf(), 2, '2 Partners registered successfully by owner');
  });

  // Attempt to make a deposit with an incorrect pool staking time ID
  it(printTitle('partnerFirst', 'fail to deposit with an incorrect pool staking time ID'), async () => {
    // Get the min ether required to launch a mini pool
    const minEther = await rocketSettings.getPoolMinEtherRequired.call().valueOf();
    // Calculate just enough ether to create the pool
    const sendAmount = minEther - web3.toWei('1', 'ether');

    // Deposit on a behalf of the partner and also specify a incorrect pool staking time ID
    const result = rocketPartnerAPI.APIpartnerDeposit(partnerFirstUserAccount, 'beer', {
      from: partnerFirst,
      value: sendAmount,
      gas: rocketDepositGas,
    });
    await assertThrows(result);
  });

  // Attempt to make a deposit with an unregistered 3rd party partner
  it(printTitle('userFirst', 'fail to deposit with an unregistered partner'), async () => {
    // Get the min ether required to launch a mini pool
    const minEther = await rocketSettings.getPoolMinEtherRequired.call().valueOf();
    // Calculate just enough ether to create the pool
    const sendAmount = minEther - web3.toWei('1', 'ether');

    // Deposit on behalf of the partner and also specify the pool staking time ID
    const result = rocketPartnerAPI.APIpartnerDeposit(userThird, 'default', {
      from: userSecond,
      value: sendAmount,
      gas: rocketDepositGas,
    });
    await assertThrows(result);
  });

  // Send Ether to Rocket pool with just less than the min amount required to launch a mini pool with no specified 3rd party user partner
  it(printTitle('userFirst', 'sends ether to RP, create first mini pool, registers user with pool'), () => {
    // Check RocketStorage is deployed first
    return RocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return RocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketUser now
        return RocketUser.deployed().then(rocketUserInstance => {
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
                miniPoolFirstInstance = RocketPoolMini.at(poolAddress);
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketUser now
          return RocketUser.deployed().then(rocketUserInstance => {
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
                  const miniPoolInstance = RocketPoolMini.at(poolAddress);
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketUser now
          return RocketUser.deployed().then(rocketUserInstance => {
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
                  const miniPoolInstance = RocketPoolMini.at(poolAddress);
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketUser now
          return RocketUser.deployed().then(rocketUserInstance => {
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketPool now
          return RocketPool.deployed().then(rocketPoolInstance => {
            // RocketUser now
            return RocketUser.deployed().then(rocketUserInstance => {
              // RocketPool api now
              return RocketPartnerAPI.deployed().then(rocketPartnerAPIInstance => {
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
                          const miniPoolInstance = RocketPoolMini.at(userPools[0]);
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
  it(printTitle('partnerFirst', 'withdraws half their users previous deposit from the mini pool'), async () => {
    // Get the user deposit total
    const pools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount).valueOf();
    assert.equal(pools.length, 1);

    // Get an instance of that pool and do further checks
    const miniPoolInstance = RocketPoolMini.at(pools[0]);
    const poolStatus = await miniPoolInstance.getStatus.call().valueOf();

    // Get the user deposit
    const depositedAmount = await miniPoolInstance.getUserDeposit.call(partnerFirstUserAccount).valueOf();
    const withdrawalAmount = depositedAmount / 2;

    // Withdraw half our deposit now through the main parent contract
    await rocketPartnerAPI.APIpartnerWithdrawal(miniPoolInstance.address, withdrawalAmount, partnerFirstUserAccount, {
      from: partnerFirst,
      gas: 4000000,
    });

    // Get our balance again
    const depositedAmountAfter = await miniPoolInstance.getUserDeposit.call(partnerFirstUserAccount).valueOf();
    const isValid = depositedAmountAfter == depositedAmount - withdrawalAmount;

    assert.isTrue(isValid, 'User has successfully withdrawn half of their balance from the mini pool.');
  });

  // First partner user withdraws the remaining deposit from the mini pool, their user is removed from it and the mini pool is destroyed as it has no users anymore
  it(
    printTitle(
      'partnerFirst',
      'withdraws their users remaining deposit from the mini pool, their user is removed from it and the mini pool is destroyed as it has no users anymore'
    ),
    async () => {
      // Get the users deposit total
      const pools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount).valueOf();
      assert.equal(pools.length, 1);

      // Get an instance of that pool and do further checks
      const miniPool = RocketPoolMini.at(pools[0]);
      const depositedAmount = await miniPool.getUserDeposit.call(partnerFirstUserAccount).valueOf();
      const withdrawalAmount = depositedAmount;

      // Withdraw our deposit now through the main parent contract
      await rocketPartnerAPI.APIpartnerWithdrawal(miniPool.address, withdrawalAmount, partnerFirstUserAccount, {
        from: partnerFirst,
        gas: rocketWithdrawalGas,
      });
      // See if RocketHub still recognises the pool contract after its been removed and self destructed
      const result = await rocketPool.getPoolExists.call(pools[0]).valueOf();
      assert.isFalse(
        result,
        'User has successfully withdrawn their balance from the mini pool and has been removed from the pool.'
      );
    }
  );

  it(
    printTitle(
      'userThird',
      'sends a lot of ether to RP, creates second mini pool, registers user with pool and sets status of minipool to countdown'
    ),
    () => {
      // Check RocketStorage is deployed first
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketPool now
          return RocketPool.deployed().then(rocketPoolInstance => {
            // RocketUser now
            return RocketUser.deployed().then(rocketUserInstance => {
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
                    miniPoolSecondInstance = RocketPoolMini.at(poolAddress);
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
  it(printTitle('userThird', 'fail to withdraw Rocket Deposit Tokens before pool begins staking'), async () => {
    // Try to withdraw tokens from that users' minipool
    const result = rocketUser.userWithdrawDepositTokens(miniPoolSecondInstance.address, 0, {
      from: userThird,
      gas: 150000,
    });
    await assertThrows(result);
  });

  // Node performs first checkin, no pools should be launched yet
  it(
    printTitle(
      'nodeFirst',
      'first node performs checkin, no mini pool awaiting launch should not be launched yet as the countdown has not passed for either'
    ),
    () => {
      // Check RocketStorage is deployed first
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return RocketNode.deployed().then(rocketNodeInstance => {
            // RocketPool now
            return RocketPool.deployed().then(rocketPoolInstance => {
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketPool now
          return RocketPool.deployed().then(rocketPoolInstance => {
            // RocketNode now
            return RocketNode.deployed().then(rocketNodeInstance => {
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketPool now
          return RocketPool.deployed().then(rocketPoolInstance => {
            // RocketNode now
            return RocketNode.deployed().then(rocketNodeInstance => {
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
    async () => {
      // Get the token withdrawal fee
      const tokenWithdrawalFee = await rocketSettings.getDepositTokenWithdrawalFeePercInWei.call().valueOf();
      // Get the total supply of tokens in circulation
      const totalTokenSupplyStr = await rocketDeposit.totalSupply.call({ from: userThird }).valueOf();
      const totalTokenSupply = parseInt(totalTokenSupplyStr);

      // Third user deposited the min required to launch a pool earlier, we need this amount so we can calculate 50%
      const userDeposit = await miniPoolSecondInstance.getUserDeposit.call(userThird).valueOf();
      const withdrawHalfAmount = parseInt(userDeposit) / 2;
      // Fee incurred on tokens
      const tokenBalanceFeeIncurred = parseFloat(
        web3.fromWei(tokenWithdrawalFee, 'ether') * web3.fromWei(withdrawHalfAmount, 'ether')
      );

      // Try to withdraw tokens from that users minipool
      await rocketUser.userWithdrawDepositTokens(miniPoolSecondInstance.address, withdrawHalfAmount, {
        from: userThird,
        gas: 250000,
      });

      // Get the total supply of tokens in circulation
      const tokenWeiSupplyAfter = await rocketDeposit.totalSupply({ from: userThird }).valueOf();
      const totalTokenSupplyAfter = parseFloat(web3.fromWei(tokenWeiSupplyAfter, 'ether'));

      // Now count how many tokens that user has, should match the amount withdrawn
      const userWeiBalance = await rocketDeposit.balanceOf.call(userThird).valueOf();
      const tokenBalance = parseFloat(web3.fromWei(userWeiBalance, 'ether'));

      // Now count how many tokens that user has, should match the amount withdrawn - fees
      const userBalance = await miniPoolSecondInstance.getUserDeposit.call(userThird).valueOf();

      // Check everything
      const tokenBalanceMatches = tokenBalance == web3.fromWei(withdrawHalfAmount, 'ether') - tokenBalanceFeeIncurred;
      const tokenSupplyMatches = tokenBalance == totalTokenSupplyAfter;
      const userBalanceMatches = userBalance == withdrawHalfAmount;

      assert.isTrue(tokenBalanceMatches && tokenSupplyMatches && userBalanceMatches);
    }
  );

  it(printTitle('userThird', 'transfers half of their deposit tokens to userFirst on the open market'), async () => {
    // Count how many tokens that user has
    const userThirdTokenBalance = await rocketDeposit.balanceOf.call(userThird).valueOf();
    // Transfer half to first user on the open market
    const tokenTransferAmount = parseInt(userThirdTokenBalance) / 2;
    // Transfer now
    await rocketDeposit.transfer(userFirst, tokenTransferAmount, { from: userThird, gas: 250000 });

    // Now count how many tokens that user has
    const userThirdTokenBalanceAfter = await rocketDeposit.balanceOf.call(userThird).valueOf();
    // Now count first user balance
    const userFirstTokenBalance = await rocketDeposit.balanceOf.call(userFirst).valueOf();

    const userThirdBalanceValid = userThirdTokenBalanceAfter == userThirdTokenBalance - tokenTransferAmount;
    const userFirstBalanceValid = userFirstTokenBalance == tokenTransferAmount;

    assert.isTrue(userFirstBalanceValid && userFirstBalanceValid, 'Users tokens do not match the amount transferred');
  });

  it(printTitle('userThird', 'fails to transfer more tokens than they own on the open market'), async () => {
    // Count how many tokens that user has
    const userThirdTokenBalance = parseInt(await rocketDeposit.balanceOf.call(userThird).valueOf());
    // Transfer to first user on the open market
    const tokenTransferAmount = userThirdTokenBalance + 10000;
    // Transfer now
    await rocketDeposit.transfer(userFirst, tokenTransferAmount, { from: userThird, gas: 250000 });

    // Now count how many tokens that user has
    const userThirdTokenBalanceAfter = parseInt(await rocketDeposit.balanceOf.call(userThird).valueOf());

    // check that none were sent
    assert.equal(userThirdTokenBalanceAfter, userThirdTokenBalance, 'Users tokens were transferred');
  });

  it(
    printTitle('userThird', 'fails to transfer tokens from userFirst account to themselves on the open market'),
    async () => {
      // Count how many tokens that user has
      const userFirstTokenBalance = parseInt(await rocketDeposit.balanceOf.call(userFirst).valueOf());
      // Transfer to third user on the open market
      const tokenTransferAmount = userFirstTokenBalance / 2;
      // Transfer now
      await rocketDeposit.transferFrom(userFirst, userThird, tokenTransferAmount, { from: userThird, gas: 250000 });

      // Now count how many tokens that user has
      const userFirstTokenBalanceAfter = parseInt(await rocketDeposit.balanceOf.call(userFirst).valueOf());

      assert.equal(userFirstTokenBalanceAfter, userFirstTokenBalance, 'Users tokens were transferred');
    }
  );

  it(
    printTitle(
      'userThird',
      'fails to trade their tokens for ether in the rocket deposit token fund as it does not have enough ether to cover the amount sent'
    ),
    async () => {
      const userThirdTokenBalance = parseInt(await rocketDeposit.balanceOf.call(userThird).valueOf());
      // Transfer now
      const result = rocketDeposit.burnTokensForEther(userThirdTokenBalance, { from: userThird, gas: 250000 });
      await assertThrows(result);
    }
  );

  it(
    printTitle(
      'userThird',
      'withdraws the remainder of their deposit as Rocket Deposit Tokens while their minipool is staking with Casper and are removed from pool'
    ),
    async () => {
      // Get the token withdrawal fee
      const tokenWithdrawalFee = parseInt(await rocketSettings.getDepositTokenWithdrawalFeePercInWei.call().valueOf());

      // Withdraw all by passing 0
      await rocketUser.userWithdrawDepositTokens(miniPoolSecondInstance.address, 0, { from: userThird, gas: 250000 });

      // User should be removed from pool now as they dont have any deposit left, they traded it all for deposit tokens
      const result = miniPoolSecondInstance.getUserDeposit.call(userThird);

      await assertThrows(result);
    }
  );

  // First user with deposit staking in minipool attempts to withdraw deposit before staking has finished
  it(printTitle('userFirst', 'user fails to withdraw deposit while minipool is staking'), async () => {
    // Attempt withdrawal of all our deposit now
    const result = rocketUser.userWithdraw(miniPoolFirstInstance.address, 0, {
      from: userFirst,
      gas: rocketWithdrawalGas,
    });
    await assertThrows(result);
  });

  // Node performs checkin
  it(
    printTitle(
      'nodeFirst',
      'first node performs another checkin, first mini pool currently staking should remain staking on it'
    ),
    () => {
      // Check RocketStorage is deployed first
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return RocketNode.deployed().then(rocketNodeInstance => {
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
    return RocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return RocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketPool now
        return RocketPool.deployed().then(rocketPoolInstance => {
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
    return RocketStorage.deployed().then(rocketStorageInstance => {
      // Check RocketSettings is deployed
      return RocketSettings.deployed().then(rocketSettingsInstance => {
        // RocketPool now
        return RocketPool.deployed().then(rocketPoolInstance => {
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return RocketNode.deployed().then(rocketNodeInstance => {
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return RocketNode.deployed().then(rocketNodeInstance => {
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return Casper.deployed().then(casperInstance => {
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return Casper.deployed().then(casperInstance => {
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return RocketNode.deployed().then(rocketNodeInstance => {
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
      return RocketStorage.deployed().then(rocketStorageInstance => {
        // Check RocketSettings is deployed
        return RocketSettings.deployed().then(rocketSettingsInstance => {
          // RocketNode now
          return RocketNode.deployed().then(rocketNodeInstance => {
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
    async () => {
      // Get the min ether required to launch a mini pool - the user sent half this amount for tokens originally
      const etherAmountTradedSentForTokens = parseInt(await rocketSettings.getPoolMinEtherRequired.call().valueOf());
      const depositTokenFundBalance = web3.eth.getBalance(rocketDeposit.address).valueOf();

      assert.equal(etherAmountTradedSentForTokens, depositTokenFundBalance);
    }
  );

  it(
    printTitle('userFirst', 'burns their deposit tokens received from userThird in return for ether + bonus'),
    async () => {
      // Get the token withdrawal fee
      const tokenWithdrawalFeeWei = await rocketSettings.getDepositTokenWithdrawalFeePercInWei.call().valueOf();
      // Token fee - this goes to the person who trades the tokens back in
      const tokenWithdrawalFee = parseFloat(web3.fromWei(tokenWithdrawalFeeWei, 'ether'));
      // Get the total supply of tokens in circulation
      const fundTokenBalance = parseFloat(await rocketDeposit.totalSupply.call().valueOf());

      // Now count how many tokens that user has
      const userFirstTokenBalance = parseFloat(await rocketDeposit.balanceOf.call(userFirst).valueOf());
      const userFirstEtherBalance = web3.eth.getBalance(userFirst).valueOf();
      const burnGas = 250000;

      // Transfer now
      await rocketDeposit.burnTokensForEther(userFirstTokenBalance, { from: userFirst, gas: burnGas });

      // Now count how many tokens that user has, should be none
      const userFirstTokenBalanceAfter = parseFloat(await rocketDeposit.balanceOf.call(userFirst).valueOf());
      const userFirstEtherBalanceAfter = web3.eth.getBalance(userFirst).valueOf();

      const fundTokenBalanceAfter = parseFloat(await rocketDeposit.totalSupply.call().valueOf());
      const etherAccountDiff = userFirstEtherBalanceAfter - userFirstEtherBalance;

      assert.equal(userFirstTokenBalanceAfter, 0, 'User balance should be zero');
      assert.equal(fundTokenBalanceAfter, fundTokenBalance - userFirstTokenBalance, 'Fund token balance did not match');
      assert.notEqual(etherAccountDiff, 0, 'Account balance did not change');
    }
  );

  // Owner attempts to remove active node
  it(
    printTitle('owner', 'fails to remove first node from the Rocket Pool network as it has mini pools attached to it'),
    async () => {
      // Remove the node now
      const result = rocketNode.nodeRemove(nodeFirst, { from: owner, gas: 200000 });
      await assertThrows(result);
    }
  );

  // First user withdraws their deposit + rewards and pays Rocket Pools fee
  it(
    printTitle('userFirst', 'withdraws their deposit + Casper rewards from the mini pool and pays their fee'),
    async () => {
      // Get the user deposit
      const depositedAmount = await miniPoolFirstInstance.getUserDeposit.call(userFirst).valueOf();
      // Fee acount is Coinbase by default
      const rpFeeAccountBalancePrev = web3.eth.getBalance(owner).valueOf();
      // Get the mini pool balance
      const miniPoolBalancePrev = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();

      // Withdraw our total deposit + rewards
      const result = await rocketUser.userWithdraw(miniPoolFirstInstance.address, 0, {
        from: userFirst,
        gas: rocketWithdrawalGas,
      });

      const log = result.logs.find(({ event }) => event == 'Transferred');
      assert.notEqual(log, undefined); // Check that an event was logged

      const amountSentToUser = log.args.value;

      // Fee acount is Coinbase by default
      const rpFeeAccountBalance = web3.eth.getBalance(owner).valueOf();
      // Get the mini pool balance
      const miniPoolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();
      // Now just count the users to make sure this user has been removed after withdrawing their balance and paying the fee
      const userCount = await miniPoolFirstInstance.getUserCount.call().valueOf();

      assert.isTrue(depositedAmount < amountSentToUser, 'Deposit amount did not decrease');
      assert.isTrue(rpFeeAccountBalance > rpFeeAccountBalancePrev, 'Fee account balance did not increase');
      assert.isTrue(miniPoolBalance < miniPoolBalancePrev, 'Minipool balance did not decrease');
      assert.equal(userCount, 1, 'User count does not match');
    }
  );

  // Second user attempts to withdraw using their backup address before the time limit to do so is allowed (3 months by default)
  it(
    printTitle('userSecond', 'fails to withdraw using their backup address before the time limit to do so is allowed'),
    async () => {
      // Attemp tp withdraw our total deposit + rewards using our backup address
      const result = rocketUser.userWithdraw(miniPoolFirstInstance.address, 0, {
        from: userSecondBackupAddress,
        gas: rocketWithdrawalGas,
      });
      await assertThrows(result);
    }
  );

  // Update first mini pool
  it(
    printTitle(
      '---------',
      'settings BackupCollectTime changed to 0 which will allow the user to withdraw via their backup address'
    ),
    async () => {
      // Set the backup withdrawal period to 0 to allow the user to withdraw using their backup address
      const result = await rocketSettings.setPoolUserBackupCollectTime(0, { from: owner, gas: 150000 });
      assert.isTrue(true, 'settings BackupCollectTime changed to 0.'); // dummy assert for now
    }
  );

  // First user attempts to withdraw again
  it(
    printTitle('userFirst', "fails to withdraw again from the pool as they've already completed withdrawal"),
    async () => {
      // Attempt tp withdraw our total deposit + rewards using our backup address
      const result = rocketUser.userWithdraw(miniPoolFirstInstance.address, 0, {
        from: userFirst,
        gas: rocketWithdrawalGas,
      });
      await assertThrows(result);
    }
  );

  // Second user withdraws their deposit + rewards and pays Rocket Pools fee, mini pool closes
  it(
    printTitle(
      'userSecond',
      'withdraws their deposit + Casper rewards using their backup address from the mini pool, pays their fee and the pool closes'
    ),
    async () => {
      // Get the user deposit
      const depositedAmount = await miniPoolFirstInstance.getUserDeposit.call(userSecond).valueOf();
      // Fee account is Coinbase by default
      const rpFeeAccountBalancePrev = web3.eth.getBalance(owner).valueOf();
      // Get the minipool balance
      const miniPoolBalancePrev = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();

      // Withdraw our total deposit + rewards
      const result = await rocketUser.userWithdraw(miniPoolFirstInstance.address, 0, {
        from: userSecondBackupAddress,
        gas: rocketWithdrawalGas,
      });

      const log = result.logs.find(({ event }) => event == 'Transferred');
      assert.notEqual(log, undefined); // Check that an event was logged

      const amountSentToUser = log.args.value;

      // Fee acount is the coinbase by default
      const rpFeeAccountBalance = web3.eth.getBalance(owner).valueOf();
      // Get the mini pool balance
      const miniPoolBalance = web3.eth.getBalance(miniPoolFirstInstance.address).valueOf();

      // See if RocketStorage still recognises the pool contract after its been removed and self destructed
      const poolExists = await rocketPool.getPoolExists.call(miniPoolFirstInstance.address).valueOf();

      assert.isTrue(depositedAmount < amountSentToUser, 'Deposit balance did not decrease');
      assert.isTrue(rpFeeAccountBalance > rpFeeAccountBalancePrev, 'Fee account balance did not increase');
      assert.isTrue(miniPoolBalance == 0, 'Minipool balance is not equal to zero');
      assert.isFalse(poolExists, "Pool exists when it shouldn't");
    }
  );

  // Owner removes first node
  it(printTitle('owner', 'removes first node from the Rocket Pool network'), async () => {
    // Remove the node now
    const result = await rocketNode.nodeRemove(nodeFirst, { from: owner, gas: 200000 });

    const log = result.logs.find(({ event }) => event == 'NodeRemoved');
    assert.notEqual(log, undefined); // Check that an event was logged

    const nodeAddress = log.args._address;

    assert.equal(nodeAddress, nodeFirst);
  });

  // Owner removes first partner - users attached to this partner can still withdraw
  it(printTitle('owner', 'removes first partner from the Rocket Pool network'), async () => {
    // Check the second partner array index
    const partnerSecondIndexPrev = await rocketPartnerAPI.getPartnerIndex.call(partnerSecond).valueOf();
    // Remove the node now
    const result = await rocketPartnerAPI.partnerRemove(partnerFirst, { from: owner, gas: 500000 });

    const log = result.logs.find(({ event }) => event == 'PartnerRemoved');
    assert.notEqual(log, undefined); // Check that an event was logged

    const partnerAddress = log.args._address;

    // The partner count should be one now
    const partnerCount = await rocketPartnerAPI.getPartnerCount.call().valueOf();
    // Now check the remaining partner array was reindexed correctly using the key/value storage
    const partnerSecondIndex = await rocketPartnerAPI.getPartnerIndex.call(partnerSecond).valueOf();

    assert.equal(partnerAddress, partnerFirst, 'Partner addresses do not match');
    assert.equal(partnerCount, 1, 'Partner count is incorrect');
    assert.equal(partnerSecondIndexPrev, 1, 'Initial second partner index is incorrect');
    assert.equal(partnerSecondIndex, 0, 'New second partner index is incorrect');
  });

  // Attempt to make a deposit with after being removed as a partner
  it(printTitle('partnerFirst', 'attempt to make a deposit with after being removed as a partner'), async () => {
    // Get the min ether required to launch a mini pool
    const minEther = await rocketSettings.getPoolMinEtherRequired.call().valueOf();
    const sendAmount = minEther - web3.toWei('1', 'ether');

    // Deposit on a behalf of the partner and also specify an incorrect pool staking time ID
    const result = rocketPartnerAPI.APIpartnerDeposit(partnerFirstUserAccount, 'default', {
      from: partnerFirst,
      value: sendAmount,
      gas: rocketDepositGas,
    });
    await assertThrows(result);
  });
});
