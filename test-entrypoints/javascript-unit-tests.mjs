import { createRequire } from 'node:module';
import { after } from 'mocha';

const require = createRequire(import.meta.url);
require('../test-old/_utils/hardhat-runtime-bootstrap');

const {
    disposeHardhatRuntime,
    initialiseTestRuntime,
} = require('../test-old/_utils/hardhat-runtime');

await initialiseTestRuntime();

after(async function() {
    await disposeHardhatRuntime();
});

const { default: verifierTests } = require('../test-unit/util/verifier-tests.js');
verifierTests();
