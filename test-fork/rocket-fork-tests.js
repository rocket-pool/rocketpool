import { afterEach, before, beforeEach, describe, it } from 'mocha';
import {
    artifacts,
    RocketDAONodeTrusted,
    RocketDAONodeTrustedProposals,
    RocketDAOProposal,
    RocketNodeStaking,
    RocketStorage,
} from '../test/_utils/artifacts';
import { voteStates } from '../test/dao/scenario-dao-proposal';
import { injectBNHelpers } from '../test/_helpers/bn';
import pako from 'pako';
import { endSnapShot, startSnapShot } from '../test/_utils/snapshotting';

const hre = require('hardhat');

const rocketStorageAddress = process.env.MAINNET_ROCKET_STORAGE || '0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46';

injectBNHelpers();
beforeEach(startSnapShot);
afterEach(endSnapShot);

function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}

describe('Fork Mainnet', () => {
});