/**
  Rocket Pool
  @author David Rugendyke
  @email david@rocketpool.net
  @version 0.2 
*/

const Web3 = require('web3');
const FS = require('fs');
const Contract = require('truffle-contract');

// Importing babel to be able to use ES6 imports
require("babel-register")({
  presets: [
    ["env", {
      "targets" : {
        "node" : "8.0"
      }
    }]
  ],
  retainLines: true,
});
require("babel-polyfill");

module.exports = {
  web3: Web3,
  fs: FS,
  contract: Contract,
  compilers: {
      solc: {
          version: "0.6.10",
      }
  },
  networks: {
    development: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '*', // Match any network id
      gas: 8000000,
    },
    // Solidity coverage test
    coverage: {
      host: '127.0.0.1',
      port: 8555,
      network_id: '*', // Match any network id
      gas: 0xfffffffffff,
      gasPrice: 0x01,
    },
    // Geth RP Testnet Development
    'betatest': {
        host: "127.0.0.1",
        port: 8999,
        network_id: "77", 
        from: "0x2f6812e7005c61835B12544EEb45958099eF45f4",
        gas: 8000000,
    },
    // Workshop network
    'workshop': {
        host: "127.0.0.1",
        port: 8545,
        network_id: "88", 
        from: "0x9ad8fd4c83b752914a9b22484686666d9a30619c",
        gas: 8000000,
    },
    // Goerli testnet
    'goerli': {
      host: '127.0.0.1',
      port: 8545,
      network_id: '5',
      gas: 8000000,
    },
  },
};
