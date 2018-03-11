/**
  Rocket Pool
  @author David Rugendyke
  @email david@mail.rocketpool.net
  @version 0.1 
*/

const Web3 = require('web3');

module.exports = {
  web3: Web3,
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*', // Match any network id
      gas: 6725527,
    },
    // Local Parity Development 
    dev: {
        host: "127.0.0.1",
        port: 8545,
        network_id: "*", 
        from: "0x00a329c0648769A73afAc7F9381E08FB43dBEA72",
        gas: 5994142,
    }
  },
};
