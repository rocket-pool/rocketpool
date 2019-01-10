// Import utils
import { displayProfiling } from './_lib/utils/profiling';

// Import tests
import rocketStorageTests from './rocket-storage/rocket-storage-tests';
import rocketAdminTests from './rocket-admin/rocket-admin-tests';
import rocketRoleTests from './rocket-role/rocket-role-tests';
import rocketPoolTests from './rocket-pool/rocket-pool-tests';
import rocketGroupAPITests from './rocket-group/rocket-group-api-tests';
import rocketGroupContractTests from './rocket-group/rocket-group-contract-tests';
import rocketNodeAPITests from './rocket-node/rocket-node-api-tests';
import rocketNodeContractDepositTests from './rocket-node/rocket-node-contract-deposit-tests';
import rocketNodeContractWithdrawalTests from './rocket-node/rocket-node-contract-withdrawal-tests';
import rocketNodeTaskAdminTests from './rocket-node/rocket-node-task-admin-tests';
import rocketNodeTaskNodeTests from './rocket-node/rocket-node-task-node-tests';
import rocketNodeTaskCalculateNodeFeeTests from './rocket-node/rocket-node-task-calculate-node-fee-tests';
import rocketDepositAPIDepositTests from './rocket-deposit/rocket-deposit-api-deposit-tests';
import rocketDepositAPIRefundTests from './rocket-deposit/rocket-deposit-api-refund-tests';
import rocketDepositAPIWithdrawalTests from './rocket-deposit/rocket-deposit-api-withdrawal-tests';
import rocketRPIPTests from './rocket-rpip/rocket-rpip-tests';
import rocketUpgradeTests from './rocket-upgrade/rocket-upgrade-tests';

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

// Run tests
rocketStorageTests();
rocketAdminTests();
rocketRoleTests();
rocketPoolTests();
rocketGroupAPITests();
rocketGroupContractTests();
rocketNodeAPITests();
rocketNodeContractDepositTests();
rocketNodeContractWithdrawalTests();
rocketNodeTaskAdminTests();
rocketNodeTaskNodeTests();
rocketNodeTaskCalculateNodeFeeTests();
rocketDepositAPIDepositTests();
rocketDepositAPIRefundTests();
rocketDepositAPIWithdrawalTests();
rocketRPIPTests();
rocketUpgradeTests();

// Profiling
displayProfiling();
