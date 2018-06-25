import { printEvent } from './_lib/utils/general';
import { RocketPool, RocketPoolMini} from './_lib/artifacts';

// Import tests
import rocketStorageTests from './rocket-storage/rocket-storage-tests';
import casperTests from './casper/casper-tests';
import rocketNodeAdminTests from './rocket-node/rocket-node-admin/rocket-node-admin-tests';
import rocketNodeStatusTests from './rocket-node/rocket-node-status/rocket-node-status-tests';
import rocketNodeValidatorTests from './rocket-node/rocket-node-validator/rocket-node-validator-tests';
import rocketPartnerAPITests from './rocket-partner-api/rocket-partner-api-tests';
import rocketUserTests from './rocket-user/rocket-user-tests';
import rocketDepositTests from './rocket-deposit/rocket-deposit-tests';
import rocketVaultAdminTests from './rocket-vault/rocket-vault-admin-tests';
import rocketVaultAccountTests from './rocket-vault/rocket-vault-account-tests';
import rocketUpgradeTests from './rocket-upgrade/rocket-upgrade-tests';
import rocketPoolTests from './rocket-pool/rocket-pool-tests';


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

// The owner
const owner = web3.eth.coinbase;

// Run tests
rocketStorageTests({owner});
casperTests({owner});
rocketNodeAdminTests({owner});
rocketNodeStatusTests({owner});
rocketNodeValidatorTests({owner});
rocketPartnerAPITests({owner});
rocketUserTests({owner});
rocketDepositTests({owner});
rocketVaultAdminTests({owner});
rocketVaultAccountTests({owner});
rocketUpgradeTests({owner});
rocketPoolTests({owner});

