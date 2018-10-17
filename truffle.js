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
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*', // Match any network id
      gas: 8000000,
    },
    // Local Parity Development 
    dev: {
        host: "127.0.0.1",
        port: 8545,
        network_id: "*", 
        from: "0x00a329c0648769A73afAc7F9381E08FB43dBEA72",
        gas: 8000000,
    }   
  },
};
