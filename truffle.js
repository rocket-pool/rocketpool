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
const mnemonicPhrase = process.env.MNEMONIC;
const mnemonicPassword = process.env.MNEMONIC_PASSWORD;
const providerHost = process.env.PROVIDER_HOST || 'localhost'; 
const providerPort = process.env.PROVIDER_PORT || 8545;
const providerProtocol = process.env.PROVIDER_PROTOCOL || 'http';

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
                phrase: mnemonicPhrase,
                password: mnemonicPassword
            },
            providerOrUrl: `${providerProtocol}://${providerHost}:${providerPort}`,
            numberOfAddresses: 1, 
            shareNonce: true,
        }),
        host: providerHost,
        port: providerPort,
        network_id: "5", 
        gas: 8000000,
        hasProvider: true
    },
  },
  mocha: {
    timeout: 0
  }
};
