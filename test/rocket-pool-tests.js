import { beforeEach, afterEach, before, after } from 'mocha';
import { endSnapShot, startSnapShot } from './_utils/snapshotting';
import { deployRocketPool } from './_helpers/deployment';
import { setDefaultParameters } from './_helpers/defaults';
import { suppressLog } from './_helpers/console';
import { injectBNHelpers } from './_helpers/bn';
import { checkInvariants } from './_helpers/invariants';

import auctionTests from './auction/auction-tests';
import daoProtocolTests from './dao/dao-protocol-tests';
import daoProtocolTreasuryTests from './dao/dao-protocol-treasury-tests';
import daoNodeTrustedTests from './dao/dao-node-trusted-tests';
import daoSecurityTests from './dao/dao-security-tests';
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
import networkSnapshotsTests from './network/network-snapshots-tests';
import networkVotingTests from './network/network-voting-tests';
import nodeDepositTests from './node/node-deposit-tests';
import nodeManagerTests from './node/node-manager-tests';
import nodeStakingTests from './node/node-staking-tests';
import nodeDistributorTests from './node/node-distributor-tests';
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

// BN helpers
injectBNHelpers();

// State snapshotting and gas usage tracking
beforeEach(startSnapShot);
afterEach(checkInvariants);
afterEach(endSnapShot);

before(async function() {
  // Deploy Rocket Pool
  await deployRocketPool();
  // Set starting parameters for all tests
  await setDefaultParameters();
});

// Run tests
auctionTests();
daoProtocolTests();
daoProtocolTreasuryTests();
daoNodeTrustedTests();
daoSecurityTests();
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
networkSnapshotsTests();
networkVotingTests();
nodeDepositTests();
nodeManagerTests();
nodeStakingTests();
nodeDistributorTests();
rethTests();
rplTests();
rewardsPoolTests();
