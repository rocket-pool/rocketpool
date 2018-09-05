const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');

export const RocketPool = artifacts.require('./contract/RocketPool');
export const RocketRole = artifacts.require('./contract/RocketRole');
export const RocketStorage = artifacts.require('./contract/RocketStorage');
export const RocketPIP = artifacts.require('./contract/RocketPIP');

/*
export const AddressListStorage = artifacts.require('./contract/AddressListStorage');
export const BoolListStorage = artifacts.require('./contract/BoolListStorage');
export const BytesListStorage = artifacts.require('./contract/BytesListStorage');
export const Bytes32ListStorage = artifacts.require('./contract/Bytes32ListStorage');
export const IntListStorage = artifacts.require('./contract/IntListStorage');
export const StringListStorage = artifacts.require('./contract/StringListStorage');
export const UintListStorage = artifacts.require('./contract/UintListStorage');
export const AddressQueueStorage = artifacts.require('./contract/AddressQueueStorage');
export const BoolQueueStorage = artifacts.require('./contract/BoolQueueStorage');
export const BytesQueueStorage = artifacts.require('./contract/BytesQueueStorage');
export const Bytes32QueueStorage = artifacts.require('./contract/Bytes32QueueStorage');
export const IntQueueStorage = artifacts.require('./contract/IntQueueStorage');
export const StringQueueStorage = artifacts.require('./contract/StringQueueStorage');
export const UintQueueStorage = artifacts.require('./contract/UintQueueStorage');
*/
