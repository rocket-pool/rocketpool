const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');

export const RocketGroupAPI = artifacts.require('./contract/RocketGroupAPI');
export const RocketGroupContract = artifacts.require('./contract/RocketGroupContract');
export const RocketGroupSettings = artifacts.require('./contract/RocketGroupSettings');
export const RocketMinipoolInterface = artifacts.require('./contract/RocketMinipoolInterface');
export const RocketMinipoolSettings = artifacts.require('./contract/RocketMinipoolSettings');
export const RocketNodeAPI = artifacts.require('./contract/RocketNodeAPI');
export const RocketNodeContract = artifacts.require('./contract/RocketNodeContract');
export const RocketNodeSettings = artifacts.require('./contract/RocketNodeSettings');
export const RocketNodeTasks = artifacts.require('./contract/RocketNodeTasks');
export const RocketPIP = artifacts.require('./contract/RocketPIP');
export const RocketPool = artifacts.require('./contract/RocketPool');
export const RocketPoolToken = artifacts.require('./contract/DummyRocketPoolToken.sol');
export const RocketRole = artifacts.require('./contract/RocketRole');
export const RocketStorage = artifacts.require('./contract/RocketStorage');

export const TestLists = artifacts.require('./test/TestLists');
export const TestQueues = artifacts.require('./test/TestQueues');
export const TestSets = artifacts.require('./test/TestSets');
export const TestNodeTask = artifacts.require('./test/TestNodeTask');
