const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');

export const RocketPool = artifacts.require('./contract/RocketPool');
export const RocketRole = artifacts.require('./contract/RocketRole');
export const RocketStorage = artifacts.require('./contract/RocketStorage');
export const RocketPIP = artifacts.require('./contract/RocketPIP');

export const TestLists = artifacts.require('./test/TestLists');
export const TestQueues = artifacts.require('./test/TestQueues');
