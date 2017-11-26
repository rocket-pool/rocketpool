// Testing a single unit test
const os = require('os');

const RocketPool = artifacts.require('./contract/RocketPool.sol');
const RocketPoolMini = artifacts.require('./contract/RocketPoolMini.sol');
const RocketSettings = artifacts.require('./contract/RocketSettings.sol');

const displayEvents = false;

// Display events triggered during the tests
if (displayEvents) {
  RocketPool.deployed().then(rocketPool => {
    const eventWatch = rocketPool
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
            const miniPool = RocketPoolMini.at(result.args._address);
            // Watch for events in mini pools also as with the main contract
            const poolEventWatch = miniPool
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

contract('RocketPool', accounts => {
  // User accounts
  const userFirst = accounts[1];
  // Estimate the correct withdrawal based on %
  it('Estimate the correct withdrawal based on %', async () => {
    const rocketPool = await RocketPool.deployed();

    const result = await rocketPool.userWithdrawDepositTest({
      from: userFirst,
      to: rocketPoolInstance.address,
      gas: 250000,
    });

    result.logs.forEach(log => {
      if (log.event == 'FlagUint' || log.event == 'FlagInt') {
        console.log(web3.fromWei(log.args.flag.valueOf(), 'ether'));
      }
    });
    assert.isTrue(result, 'Single unit test failed');
  });
});
