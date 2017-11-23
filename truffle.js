/**
  Rocket Pool
  @author David Rugendyke
  @email david@mail.rocketpool.net
  @version 0.1 
*/

var Web3Utils = require('web3-utils');

module.exports = {
  web3Utils: Web3Utils,
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*', // Match any network id
      gas: 6725527,
    },
    /*
        // Local Parity Development 
        dev: {
            host: "localhost",
            port: 8545,
            network_id: "17", 
            gas: 5500000,
            from: "0x002bea02E77F561004922483bA166f463eb16765"
        }*/
  },
};
