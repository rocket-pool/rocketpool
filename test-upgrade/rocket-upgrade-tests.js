import { afterEach, before, beforeEach } from 'mocha';
import { injectBNHelpers } from '../test/_helpers/bn';
import { endSnapShot, startSnapShot } from '../test/_utils/snapshotting';
import minipoolTests from './tests/minipool-tests';
import stakingTests from './tests/staking-tests';
import miscTests from './tests/misc-tests';

injectBNHelpers();
beforeEach(startSnapShot);
afterEach(endSnapShot);

minipoolTests()
stakingTests()
miscTests()