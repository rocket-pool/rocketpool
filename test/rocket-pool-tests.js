import { printGasUsage, startGasUsage, endGasUsage } from './_utils/gasusage';
import { endSnapShot, injectGlobalSnapShot, startSnapShot } from './_utils/snapshotting';
import { deployRocketPool } from './_helpers/deployment';
import { setDefaultParameters } from './_helpers/defaults';
import { suppressLog } from './_helpers/console';
// Import tests
import auctionTests from './auction/auction-tests';
import depositPoolTests from './deposit/deposit-pool-tests';
import minipoolScrubTests from './minipool/minipool-scrub-tests';
import minipoolTests from './minipool/minipool-tests';
import minipoolVacantTests from './minipool/minipool-vacant-tests';
import minipoolStatusTests from './minipool/minipool-status-tests';
import minipoolWithdrawalTests from './minipool/minipool-withdrawal-tests';
import networkBalancesTests from './network/network-balances-tests';
import networkPenaltiesTests from './network/network-penalties-tests';
import networkFeesTests from './network/network-fees-tests';
import networkPricesTests from './network/network-prices-tests';
import nodeDepositTests from './node/node-deposit-tests';
import nodeManagerTests from './node/node-manager-tests';
import nodeStakingTests from './node/node-staking-tests';
import nodeDistributorTests from './node/node-distributor-tests';
import daoProtocolTests from './dao/dao-protocol-tests';
import daoNodeTrustedTests from './dao/dao-node-trusted-tests';
import rethTests from './token/reth-tests';
import rplTests from './token/rpl-tests';
import rewardsPoolTests from './rewards/rewards-tests';
import { injectBNHelpers } from './_helpers/bn';
import { checkInvariants } from './_helpers/invariants';

// Header
console.log('\n');
console.log('______           _        _    ______           _ ');
console.log('| ___ \\         | |      | |   | ___ \\         | |');
console.log('| |_/ /___   ___| | _____| |_  | |_/ /__   ___ | |');
console.log('|    // _ \\ / __| |/ / _ \\ __| |  __/ _ \\ / _ \\| |');
console.log('| |\\ \\ (_) | (__|   <  __/ |_  | | | (_) | (_) | |');
console.log('\\_| \\_\\___/ \\___|_|\\_\\___|\\__| \\_|  \\___/ \\___/|_|');

// BN helpers
injectBNHelpers();

// State snapshotting and gas usage tracking
beforeEach(startSnapShot);
beforeEach(startGasUsage);
afterEach(checkInvariants);
afterEach(endGasUsage);
afterEach(endSnapShot);
after(printGasUsage);

before(async function() {
  // Deploy Rocket Pool
  await suppressLog(deployRocketPool);
  // Set starting parameters for all tests
  await setDefaultParameters();
  // Inject a global snapshot before every suite
  injectGlobalSnapShot(this.test.parent)
});

// Run tests
daoProtocolTests();
daoNodeTrustedTests();
auctionTests();
depositPoolTests();
minipoolScrubTests();
minipoolTests();
minipoolVacantTests();
minipoolStatusTests();
minipoolWithdrawalTests();
networkBalancesTests();
networkPenaltiesTests();
networkFeesTests();
networkPricesTests();
nodeDepositTests();
nodeManagerTests();
nodeStakingTests();
nodeDistributorTests();
rethTests();
rplTests();
rewardsPoolTests();
