// Import tests
import rocketStorageTests from './rocket-storage/rocket-storage-tests';
import rocketGroupTests from './rocket-group/rocket-group-tests';
import rocketNodeTaskAdminTests from './rocket-node/rocket-node-task-admin-tests';
import rocketNodeTaskNodeTests from './rocket-node/rocket-node-task-node-tests';
import rocketRPIPTests from './rocket-rpip/rocket-rpip-tests';

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
rocketGroupTests();
rocketNodeTaskAdminTests();
rocketNodeTaskNodeTests();
rocketRPIPTests();
