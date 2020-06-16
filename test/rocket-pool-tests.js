// Import tests
import depositPoolTests from './deposit/deposit-pool-tests';
import minipoolTests from './minipool/minipool-tests';
import minipoolStatusTests from './minipool/minipool-status-tests';
import networkBalancesTests from './network/network-balances-tests';
import networkWithdrawalTests from './network/network-withdrawal-tests';
import nodeDepositTests from './node/node-deposit-tests';
import nodeManagerTests from './node/node-manager-tests';
import depositSettingsTests from './settings/deposit-settings-tests';
import minipoolSettingsTests from './settings/minipool-settings-tests';
import networkSettingsTests from './settings/network-settings-tests';
import nodeSettingsTests from './settings/node-settings-tests';
import nethTests from './token/neth-tests';

// Header
console.log('\n');
console.log('______           _        _    ______           _ ');
console.log('| ___ \\         | |      | |   | ___ \\         | |');
console.log('| |_/ /___   ___| | _____| |_  | |_/ /__   ___ | |');
console.log('|    // _ \\ / __| |/ / _ \\ __| |  __/ _ \\ / _ \\| |');
console.log('| |\\ \\ (_) | (__|   <  __/ |_  | | | (_) | (_) | |');
console.log('\\_| \\_\\___/ \\___|_|\\_\\___|\\__| \\_|  \\___/ \\___/|_|');

// Run tests
depositPoolTests();
minipoolTests();
minipoolStatusTests();
networkBalancesTests();
networkWithdrawalTests();
nodeDepositTests();
nodeManagerTests();
depositSettingsTests();
minipoolSettingsTests();
networkSettingsTests();
nodeSettingsTests();
nethTests();
