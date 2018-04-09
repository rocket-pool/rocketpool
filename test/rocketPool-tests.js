import { printEvent } from './utils';
import { RocketPool, RocketPoolMini} from './artifacts';

// Import tests
import rocketStorageTests from './rocket-storage/rocket-storage-tests';
import casperTests from './casper/casper-tests';
import rocketNodeTests from './rocket-node/rocket-node-tests';
import rocketPartnerAPITests from './rocket-partner-api/rocket-partner-api-tests';
import rocketUserTests from './rocket-user/rocket-user-tests';
import rocketDepositTests from './rocket-deposit/rocket-deposit-tests';
import rocketVaultAdminTests from './rocket-vault/rocket-vault-admin-tests';
import rocketVaultAccountTests from './rocket-vault/rocket-vault-account-tests';
import rocketUpgradeTests from './rocket-upgrade/rocket-upgrade-tests';


/**
 * Event logging
 */


// Toggle display of events
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
        // This will catch all events, regardless of how they originated.
        if (error == null) {
          // Print the event
          printEvent('rocket', result, '\x1b[33m%s\x1b[0m:');
          // Listen for new pool events too
          if (result.event == 'PoolCreated') {
            // Get an instance of that pool
            const miniPool = RocketPoolMini.at(result.args._address);
            // Watch for events in minipools also as with the main contract
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


/**
 * Header
 */


// Excessive? Yeah probably :)
console.log('\n');
console.log('______           _        _    ______           _ ');
console.log('| ___ \\         | |      | |   | ___ \\         | |');
console.log('| |_/ /___   ___| | _____| |_  | |_/ /__   ___ | |');
console.log('|    // _ \\ / __| |/ / _ \\ __| |  __/ _ \\ / _ \\| |');
console.log('| |\\ \\ (_) | (__|   <  __/ |_  | | | (_) | (_) | |');
console.log('\\_| \\_\\___/ \\___|_|\\_\\___|\\__| \\_|  \\___/ \\___/|_|');


/**
 * Tests
 */


// The owner
const owner = web3.eth.coinbase;

// Run tests
rocketStorageTests({owner});
casperTests({owner});
rocketNodeTests({owner});
rocketPartnerAPITests({owner});
rocketUserTests({owner});
rocketDepositTests({owner});
rocketVaultAdminTests({owner});
rocketVaultAccountTests({owner});
rocketUpgradeTests({owner});


// rocketStorageTests - nil
// casperTests - increment epoch x2 and dynasty x1
// rocketNodeRegistrationTests - register first and second nodes
// rocketPartnerAPIRegistrationTests - register first and second partners
// rocketPartnerAPIDepositTests1 - nil
// rocketUserDepositTests1 - first and second users deposit to create first minipool (countdown)
// rocketUserWithdrawalAddressTests - second user registers a backup withdrawal address
// rocketPartnerAPIDepositTests2 - first partner deposits to create temp minipool (accepting)
// rocketPartnerAPIWithdrawalTests - first partner withdraws entire deposit to destroy temp minipool
// rocketUserDepositTests2 - third user deposits to create second minipool (countdown)
// rocketDepositTests1 - nil
// rocketNodeCheckinTests1 - first and second nodes checkin to launch first and second minipools
// rocketDepositTests2 - third user withdraws entire deposit as RPD and transfers 25% of RPD to first user
// rocketUserWithdrawalTests1 - nil
// rocketNodeCheckinTests2 - first and second nodes checkin to log first and second minipools out from Casper and request withdrawals; second minipool with no users closes
// rocketDepositTests3 - first user burns RPD for ether & bonus
// rocketNodeRemovalTests1 - nil
// rocketUserWithdrawalTests2 - first and second users withdraw deposits & rewards from first minipool; first minipool with no users closes
// rocketNodeRemovalTests2 - remove first node
// rocketPartnerAPIRemovalTests - remove first partner
// rocketPartnerAPIDepositTests3 - nil

