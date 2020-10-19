module.exports = {
    providerOptions: {
        default_balance_ether: 100000,
    },
    testCommand: 'truffle test test/rocketPool-tests.js --network coverage',
    skipFiles: [
        'lib',
        'interface',
        'test',
        'contract/token/DummyRocketPoolToken.sol',
        'contract/token/StandardToken.sol',
        'contract/utils/Maths.sol',
        'contract/utils/Ownable.sol',
        'contract/utils/Signatures.sol',
    ],
};
