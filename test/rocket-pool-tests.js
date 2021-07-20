// Import tests
import auctionTests from './auction/auction-tests';
import depositPoolTests from './deposit/deposit-pool-tests';
import minipoolTests from './minipool/minipool-tests';
import minipoolStatusTests from './minipool/minipool-status-tests';
import minipoolWithdrawalTests from './minipool/minipool-withdrawal-tests';
import networkBalancesTests from './network/network-balances-tests';
import networkFeesTests from './network/network-fees-tests';
import networkPricesTests from './network/network-prices-tests';
import nodeDepositTests from './node/node-deposit-tests';
import nodeManagerTests from './node/node-manager-tests';
import nodeStakingTests from './node/node-staking-tests';
import daoProtocolTests from './dao/dao-protocol-tests';
import daoNodeTrustedTests from './dao/dao-node-trusted-tests';
import rethTests from './token/reth-tests';
import rplTests from './token/rpl-tests';
import rewardsPoolTests from './rewards/rewards-tests';
import networkStakingTests from './network/network-staking-tests';
import { printGasUsage, startGasUsage, endGasUsage } from './_utils/gasusage'
import { endSnapShot, startSnapShot } from './_utils/snapshotting'

// Header
console.log('\n');
console.log('______           _        _    ______           _ ');
console.log('| ___ \\         | |      | |   | ___ \\         | |');
console.log('| |_/ /___   ___| | _____| |_  | |_/ /__   ___ | |');
console.log('|    // _ \\ / __| |/ / _ \\ __| |  __/ _ \\ / _ \\| |');
console.log('| |\\ \\ (_) | (__|   <  __/ |_  | | | (_) | (_) | |');
console.log('\\_| \\_\\___/ \\___|_|\\_\\___|\\__| \\_|  \\___/ \\___/|_|');

// State snapshotting and gas usage tracking
beforeEach(startSnapShot);
beforeEach(startGasUsage);
afterEach(endGasUsage);
afterEach(endSnapShot);
after(printGasUsage);

// Run tests
daoProtocolTests();
daoNodeTrustedTests();
auctionTests();
depositPoolTests();
minipoolTests();
minipoolStatusTests();
minipoolWithdrawalTests();
networkBalancesTests();
networkFeesTests();
networkPricesTests();
networkStakingTests();
nodeDepositTests();
nodeManagerTests();
nodeStakingTests();
rethTests();
rplTests();
rewardsPoolTests();
