// Import tests
import auctionTests from './auction/auction-tests';
import depositPoolTests from './deposit/deposit-pool-tests';
import minipoolScrubTests from './minipool/minipool-scrub-tests';
import minipoolTests from './minipool/minipool-tests';
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
import upgradeTests from './upgrade/upgrade-tests';
import { printGasUsage, startGasUsage, endGasUsage } from './_utils/gasusage';
import { endSnapShot, startSnapShot } from './_utils/snapshotting';
import { setDAOProtocolBootstrapSetting } from './dao/scenario-dao-protocol-bootstrap';
import {
  RocketDAOProtocolSettingsDeposit, RocketDAOProtocolSettingsInflation,
  RocketDAOProtocolSettingsMinipool,
  RocketDAOProtocolSettingsNetwork,
  RocketDAOProtocolSettingsNode
} from './_utils/artifacts';

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

// Setup starting parameters for all tests
before(async function() {
  const [guardian] = await web3.eth.getAccounts();
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.enabled', true, { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.assign.enabled', true, { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.pool.maximum', web3.utils.toWei('1000', 'ether'), { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.registration.enabled', true, { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.deposit.enabled', true, { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.submit.withdrawable.enabled', true, { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', web3.utils.toWei('0.05', 'ether'), { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', web3.utils.toWei('0.1', 'ether'), { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', web3.utils.toWei('0.2', 'ether'), { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.demand.range', web3.utils.toWei('1000', 'ether'), { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsInflation, 'rpl.inflation.interval.start', Math.floor(new Date().getTime() / 1000) + (60 * 60 * 24 * 14), { from: guardian });
});

// Run tests
daoProtocolTests();
daoNodeTrustedTests();
auctionTests();
depositPoolTests();
minipoolScrubTests();
minipoolTests();
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
upgradeTests();
