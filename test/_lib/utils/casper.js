// Casper functionaility for Rocket Pools unit tests

const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');

import { getABI, getContractAddressFromStorage } from './general';


// Load our precompiled casper contract now as web3.eth.contract
async function Casper() {
    return new $web3.eth.Contract(getABI(__dirname + '/../../../contracts/contract/casper/compiled/Deposit.abi'), await getContractAddressFromStorage('casperDeposit'));
}

// Load our precompiled casper contract now as web3.eth.contract
export async function CasperInstance() {
    return await Casper();
}
