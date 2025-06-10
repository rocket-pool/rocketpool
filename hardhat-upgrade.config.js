let common = require('./hardhat-common.config.js');

// Config from environment
const mnemonicPhrase = process.env.MNEMONIC || 'test test test test test test test test test test test junk';
const mnemonicPassword = process.env.MNEMONIC_PASSWORD;
const providerUrl = process.env.PROVIDER_URL || 'http://localhost:8545';

module.exports = Object.assign(common, {
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
