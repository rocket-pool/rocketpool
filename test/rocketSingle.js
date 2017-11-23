// Testing a single unit test

var os = require('os');
var rocketHub = artifacts.require('./contract/RocketHub.sol');
var rocketPool = artifacts.require('./contract/RocketPool.sol');
var rocketPoolMini = artifacts.require('./contract/RocketPoolMini.sol');
var rocketSettings = artifacts.require('./contract/RocketSettings.sol');

var displayEvents = false;

// Display events triggered during the tests
if (displayEvents) {
  rocketPool.deployed().then(function(rocketPoolInstance) {
    var eventWatch = rocketPoolInstance
      .allEvents({
        fromBlock: 0,
        toBlock: 'latest',
      })
      .watch(function(error, result) {
        // Print the event to console
        var printEvent = function(type, result, colour) {
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
            var poolInstance = rocketPoolMini.at(result.args._address);
            // Watch for events in mini pools also as with the main contract
            var poolEventWatch = poolInstance
              .allEvents({
                fromBlock: 0,
                toBlock: 'latest',
              })
              .watch(function(error, result) {
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

contract('RocketPool', function(accounts) {
  // User accounts
  var userFirst = accounts[1];
  // Estimate the correct withdrawal based on %
  it('Estimate the correct withdrawal based on %', function() {
    // RocketPool now
    return rocketPool.deployed().then(function(rocketPoolInstance) {
      // Transaction
      return rocketPoolInstance
        .userWithdrawDepositTest({ from: userFirst, to: rocketPoolInstance.address, gas: 250000 })
        .then(function(result) {
          for (var i = 0; i < result.logs.length; i++) {
            if (result.logs[i].event == 'FlagUint' || result.logs[i].event == 'FlagInt') {
              console.log(web3.fromWei(result.logs[i].args.flag.valueOf(), 'ether'));
            }
          }
          return result;
        })
        .then(function(result) {
          assert.isTrue(result, 'Single Unit Test Failed');
        });
    });
  }); // End Test
});
