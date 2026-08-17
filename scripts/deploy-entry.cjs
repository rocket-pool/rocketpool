require('../test-old/_utils/hardhat-runtime-bootstrap');

const { initialiseHardhatRuntime } = require('../test-old/_utils/hardhat-runtime');

initialiseHardhatRuntime()
    .then(() => require('./deploy'))
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
