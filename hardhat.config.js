require('hardhat-gas-reporter');
require('solidity-coverage');

let common = require('./hardhat-common.config.js');

// Config from environment
const mnemonicPhrase = process.env.MNEMONIC || 'test test test test test test test test test test test junk';
const mnemonicPassword = process.env.MNEMONIC_PASSWORD;
const providerUrl = process.env.PROVIDER_URL || 'http://localhost:8545';

module.exports = Object.assign(common, {
    networks: {
        hardhat: {
            accounts: {
                count: 50,
                accountsBalance: '10000000000000000000000000',
            },
        },
        localhost: {
            host: '127.0.0.1',
            port: 8545,
            network_id: '*',
        },
        custom: {
            url: `${providerUrl}`,
            accounts: {
                mnemonic: mnemonicPhrase,
                path: 'm/44\'/60\'/0\'/0',
                initialIndex: 0,
                count: 1,
                passphrase: mnemonicPassword,
            },
            network_id: '*',
        },
    },
    gasReporter: {
        enabled: !!process.env.REPORT_GAS,
    },
});
