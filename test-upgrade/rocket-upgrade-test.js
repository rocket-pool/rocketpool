import { afterEach, before, beforeEach } from 'mocha';
import { injectBNHelpers } from '../test/_helpers/bn';
import { endSnapShot, startSnapShot } from '../test/_utils/snapshotting';
import miscTests from './tests/misc-tests';

injectBNHelpers();
beforeEach(startSnapShot);
afterEach(endSnapShot);

miscTests()