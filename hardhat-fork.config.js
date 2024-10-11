let common = require('./hardhat-common.config.js');

// Config from environment
const mainnetProviderUrl = process.env.MAINNET_PROVIDER_URL || 'http://localhost:8545';

module.exports = Object.assign(common, {
    networks: {
        hardhat: {
            forking: {
                url: mainnetProviderUrl,
            },
        },
    },
    paths: {
        tests: './test-fork',
    }
});
