/**
  Rocket Pool
  @author David Rugendyke
  @email david@rocketpool.net
  @version 0.2 
*/

const Web3 = require('web3');
const FS = require('fs');
const Contract = require('truffle-contract');
const HDWalletProvider = require('@truffle/hdwallet-provider');
const mnemonicPhrase = process.env.MNEMONIC;
const mnemonicPassword = process.env.MNEMONIC_PASSWORD;
const providerHost = process.env.PROVIDER_HOST || 'localhost';
const providerPort = process.env.PROVIDER_PORT || 9650;
const providerProtocol = process.env.PROVIDER_PROTOCOL || 'http';
const protocol = 'http';
const ip = 'localhost';
const port = 63975;
const provider = new Web3.providers.HttpProvider(`${protocol}://${ip}:${port}/ext/bc/C/rpc`);
const privateKeys = [
  '0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027',
  '0x7b4198529994b0dc604278c99d153cfd069d594753d471171a1d102a10438e07',
  '0x15614556be13730e9e8d6eacc1603143e7b96987429df8726384c2ec4502ef6e',
  '0x31b571bf6894a248831ff937bb49f7754509fe93bbd2517c9c73c4144c0e97dc',
  '0x6934bef917e01692b789da754a0eae31a8536eb465e7bff752ea291dad88c675',
  '0xe700bdbdbc279b808b1ec45f8c2370e4616d3a02c336e68d85d4668e08f53cff',
  '0xbbc2865b76ba28016bc2255c7504d000e046ae01934b04c694592a6276988630',
  '0xcdbfd34f687ced8c6968854f8a99ae47712c4f4183b78dcc4a903d1bfe8cbf60',
  '0x86f78c5416151fe3546dece84fda4b4b1e36089f2dbc48496faf3a950f16157c',
  '0x750839e9dbbd2a0910efe40f50b2f3b2f2f59f5580bb4b83bd8c1201cf9a010a',
  '0x79650c4920776bc10f1c0c7e8d6fc44c44ea77049b183d5000fc08d7aed76cdf',
];

// Importing babel to be able to use ES6 imports
require('babel-register')({
  presets: [
    [
      'env',
      {
        targets: {
          node: '8.0',
        },
      },
    ],
  ],
  retainLines: true,
});
require('babel-polyfill');

module.exports = {
  web3: Web3,
  fs: FS,
  contract: Contract,
  compilers: {
    solc: {
      version: '0.7.6',
      settings: {
        optimizer: {
          enabled: true,
          runs: 15000,
        },
      },
    },
  },
  plugins: ['solidity-coverage'],
  networks: {
    development: {
      provider: () => {
        return new HDWalletProvider(privateKeys, `${protocol}://${ip}:${port}/ext/bc/C/rpc`, 0, 10);
      },
      network_id: '*',
      gas: 8000000,
      gasPrice: 225000000000,
    },
    fuji: {
      networkCheckTimeout: 999999,
      provider: () =>
        new HDWalletProvider(
          'genre siege wild share garment mention garden scissors usage occur brown pulp amount comic scrap analyst coast prefer drift vital hurdle uncle original nominee',
          `https://api.avax-test.network/ext/bc/C/rpc`
        ),
      network_id: 43113,
      timeoutBlocks: 2000,
      confirmation: 10,
      gas: 8000000,
      gasPrice: 225000000000,
    },
    // development: {
    //   host: '127.0.0.1',
    //   port: 9650,
    //   network_id: '*', // Match any network id
    //   gas: 3000000,
    //   gasPrice: 225000000000,
    // },
    // Solidity coverage test
    coverage: {
      host: '127.0.0.1',
      port: 8555,
      network_id: '*', // Match any network id
      gas: 12450000,
    },
    // Geth RP Testnet Development
    // Remove accounts[0] lookup in migrations script when deploying
    goerli: {
      provider: () =>
        new HDWalletProvider({
          mnemonic: {
            phrase: mnemonicPhrase,
            password: mnemonicPassword,
          },
          providerOrUrl: `${providerProtocol}://${providerHost}:${providerPort}`,
          numberOfAddresses: 1,
          shareNonce: true,
        }),
      host: providerHost,
      port: providerPort,
      network_id: '5',
      gas: 8000000,
      hasProvider: true,
    },
  },
  mocha: {
    timeout: 0,
  },
};
