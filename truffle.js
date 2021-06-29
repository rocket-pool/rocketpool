/**
  Rocket Pool
  @author David Rugendyke
  @email david@rocketpool.net
  @version 0.2 
*/

const Web3 = require('web3');
const FS = require('fs');
const Contract = require('truffle-contract');
const HDWalletProvider = require("@truffle/hdwallet-provider");

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
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 15000
          }
        }
    }
  },
  plugins: ["solidity-coverage"],
  networks: {
    development: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '*', // Match any network id
      gas: 12450000,
    },
    // Solidity coverage test
    coverage: {
      host: '127.0.0.1',
      port: 8555,
      network_id: '*', // Match any network id
      gas: 12450000,
    },
    // Geth RP Testnet Development
    'betatest': {
      host: "127.0.0.1",
      port: 8999,
      network_id: "77", 
      from: "0x2f6812e7005c61835B12544EEb45958099eF45f4",
      gas: 12450000,
    },
    // Workshop network
    'workshop': {
      host: "127.0.0.1",
      port: 8545,
      network_id: "88", 
      from: "0x9ad8fd4c83b752914a9b22484686666d9a30619c",
      gas: 12450000,
    },
    // Geth RP Testnet Development
    // Remove accounts[0] lookup in migrations script when deploying
    'goerli': {
        provider: () =>
        new HDWalletProvider({
            mnemonic: {
                phrase: "",
                password: null
            },
            providerOrUrl: "http://127.0.0.1:8545",
            numberOfAddresses: 1, 
            shareNonce: true,
            derivationPath: "m/44'/60'/0'/0"
        }),
        host: 'http://127.0.0.1',
        port: 8545,
        network_id: "5", 
        from: "0xFfc1f495d6D033Bc3CE027A87bfDe574b09b7BeD",
        gas: 8000000,
    },
  },
  mocha: {
    timeout: 0
  }
};
