// Import tests
import upgradeTests from './core/upgrade-tests';
import auctionTests from './auction/auction-tests';
import depositPoolTests from './deposit/deposit-pool-tests';
import minipoolTests from './minipool/minipool-tests';
import minipoolStatusTests from './minipool/minipool-status-tests';
import networkBalancesTests from './network/network-balances-tests';
import networkFeesTests from './network/network-fees-tests';
import networkPricesTests from './network/network-prices-tests';
import networkWithdrawalTests from './network/network-withdrawal-tests';
import nodeDepositTests from './node/node-deposit-tests';
import nodeManagerTests from './node/node-manager-tests';
import nodeStakingTests from './node/node-staking-tests';
import daoProtocolTests from './dao/dao-protocol-tests';
import daoNodeTrustedTests from './dao/dao-node-trusted-tests';
import nethTests from './token/neth-tests';
import rethTests from './token/reth-tests';
import rplTests from './token/rpl-tests';
import rewardsPoolTests from './rewards/rewards-tests';

// Header
console.log('\n');
console.log('______           _        _    ______           _ ');
console.log('| ___ \\         | |      | |   | ___ \\         | |');
console.log('| |_/ /___   ___| | _____| |_  | |_/ /__   ___ | |');
console.log('|    // _ \\ / __| |/ / _ \\ __| |  __/ _ \\ / _ \\| |');
console.log('| |\\ \\ (_) | (__|   <  __/ |_  | | | (_) | (_) | |');
console.log('\\_| \\_\\___/ \\___|_|\\_\\___|\\__| \\_|  \\___/ \\___/|_|');

// Run tests
daoProtocolTests();
daoNodeTrustedTests();
upgradeTests();
auctionTests();
depositPoolTests();
minipoolTests();
minipoolStatusTests();
networkBalancesTests();
networkFeesTests();
networkPricesTests();
networkWithdrawalTests();
nodeDepositTests();
nodeManagerTests();
nodeStakingTests();
nethTests();
rethTests();
rplTests();
rewardsPoolTests();
