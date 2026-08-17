import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../test-old/_utils/hardhat-runtime-bootstrap');

const { initialiseTestRuntime } = require('../test-old/_utils/hardhat-runtime');
await initialiseTestRuntime();
await import('../test-old/rocket-pool-tests.js');
