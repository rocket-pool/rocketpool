/**
  Rocket Pool
  @author David Rugendyke
  @email david@mail.rocketpool.net
  @version 0.1 
*/

const Web3Utils = require('web3-utils');

module.exports = {
  web3Utils: Web3Utils,
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*', // Match any network id
      gas: 6725527,
    },
    // Local Parity Development 
    dev: {
        host: "localhost",
        port: 8545,
        network_id: "17", 
        from: "0x00d972e71288652A4B93D7a057D905364240D48A",
        gas: 6725527,
    }
  },
};
