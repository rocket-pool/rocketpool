const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');

import { getABI, getContractAddressFromStorage } from './utils/general';

export const RocketPool = artifacts.require('./contract/RocketPool');
export const RocketUser = artifacts.require('./contract/RocketUser');
export const RocketNodeAdmin = artifacts.require('./contract/RocketNodeAdmin');
export const RocketNodeStatus = artifacts.require('./contract/RocketNodeStatus');
export const RocketNodeValidator = artifacts.require('./contract/RocketNodeValidator');
export const RocketPoolMini = artifacts.require('./contract/RocketPoolMini');
export const RocketDepositToken = artifacts.require('./contract/RocketDepositToken');
export const RocketPartnerAPI = artifacts.require('./contract/RocketPartnerAPI');
export const RocketVault = artifacts.require('./contract/RocketVault');
export const RocketVaultStore = artifacts.require('./contract/RocketVaultStore');
export const RocketRole = artifacts.require('./contract/RocketRole');
export const RocketSettings = artifacts.require('./contract/RocketSettings');
export const RocketStorage = artifacts.require('./contract/RocketStorage');
export const RocketUpgrade = artifacts.require('./contract/RocketUpgrade');

