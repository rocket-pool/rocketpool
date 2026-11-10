import { createRequire } from 'node:module';
import { after } from 'mocha';

const require = createRequire(import.meta.url);
require('../test-unit/_utils/hardhat-runtime-bootstrap');

const {
    disposeHardhatRuntime,
    initialiseTestRuntime,
} = require('../test-unit/_utils/hardhat-runtime');

// Register the fresh-deployment artifacts before initialising them.
const { default: freshDeploymentTests } = require('../test-unit/deployment/bls-deployment-tests.js');

await initialiseTestRuntime();

after(async function() {
    await disposeHardhatRuntime();
});

const { default: verifierTests } = require('../test-unit/util/verifier-tests.js');
verifierTests();

const { default: blsTests } = require('../test-unit/util/bls-tests.js');
blsTests();

const { default: blsFieldTests } = require('../test-unit/util/bls-field-tests.js');
blsFieldTests();

freshDeploymentTests();
