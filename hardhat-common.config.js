require('dotenv').config();
require('@nomicfoundation/hardhat-ethers');

// Importing babel to be able to use ES6 imports
require('@babel/register')({
    presets: [
        ['@babel/preset-env', {
            'targets': {
                'node': '16',
            },
        }],
    ],
    only: [/test|scripts/],
    retainLines: true,
});
require('@babel/polyfill');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        compilers: [
            {
                version: '0.7.6',
                settings: {
                    optimizer: {
                        enabled: false,
                    },
                },
            },
            {
                version: '0.8.30',
                settings: {
                    optimizer: {
                        enabled: false,
                    },
                },
            },
        ],
    },
    networks: {},
    paths: {
        sources: './contracts',
        tests: './test',
        cache: './cache',
        artifacts: './artifacts',
    },
    mocha: {
        timeout: 0,
    },
};
