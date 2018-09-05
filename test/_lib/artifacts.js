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
export const Bytes32QueueStorage = artifacts.require('./contract/Bytes32QueueStorage');
export const IntListStorage = artifacts.require('./contract/IntListStorage');
export const StringListStorage = artifacts.require('./contract/StringListStorage');
export const UintListStorage = artifacts.require('./contract/UintListStorage');
*/
