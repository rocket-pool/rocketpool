let common = require('./hardhat-common.config.js');

// Config from environment
const mnemonicPhrase = process.env.MNEMONIC || 'test test test test test test test test test test test junk';
const mnemonicPassword = process.env.MNEMONIC_PASSWORD;
const providerUrl = process.env.PROVIDER_URL || 'http://localhost:8545';

module.exports = Object.assign(common, {
    solidity: {
        compilers: [
            {
                version: '0.8.30',
                settings: {
                    viaIR: true,
                    optimizer: {
                        enabled: true,
                        runs: 15000,
                    },
                },
            },
            {
                version: '0.7.6',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 15000,
                    },
                },
            },
        ],
    },
    networks: {
        custom: {
            url: `${providerUrl}`,
            accounts: {
                mnemonic: mnemonicPhrase,
                path: 'm/44\'/60\'/0\'/0',
                initialIndex: 0,
                count: 10,
                passphrase: mnemonicPassword,
            },
            network_id: '*',
        },
    },
    paths: {
        tests: './test-upgrade',
    }
});
