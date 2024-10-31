import { afterEach, before, beforeEach, describe, it } from 'mocha';
import {
    Artifacts,
    artifacts, RocketNetworkVoting,
    RocketNodeManager,
    RocketStorage,
    RocketUpgradeOneDotFour,
} from '../test/_utils/artifacts';
import { injectBNHelpers } from '../test/_helpers/bn';
import { endSnapShot, globalSnapShot, startSnapShot } from '../test/_utils/snapshotting';
import { registerNode } from '../test/_helpers/node';
import { printTitle } from '../test/_utils/formatting';
import { setDefaultParameters } from '../test/_helpers/defaults';
import { deployMegapool, nodeDeposit } from '../test/_helpers/megapool';
import { deployUpgrade } from './_helpers/upgrade';
import { setDaoNodeTrustedBootstrapUpgrade } from '../test/dao/scenario-dao-node-trusted-bootstrap';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

injectBNHelpers();
beforeEach(startSnapShot);
afterEach(endSnapShot);

const rocketStorageAddress = process.env.ROCKET_STORAGE || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

describe('Test Upgrade', () => {
    let owner,
        node,
        nodeWithdrawalAddress,
        random;

    let upgradeContract;

    before(async () => {
        await globalSnapShot();

        [
            owner,
            node,
            nodeWithdrawalAddress,
            random,
        ] = await ethers.getSigners();

        // Deploy upgrade while global artifacts are still latest version
        upgradeContract = await deployUpgrade(rocketStorageAddress);
        // Load artifacts from old deployment and initialise default parameters
        await artifacts.loadFromDeployment(rocketStorageAddress);
        await setDefaultParameters();
    });

    async function executeUpgrade() {
        // Bootstrap add the upgrade contract and execute
        await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketUpgradeOneDotFour', RocketUpgradeOneDotFour.abi, upgradeContract.target, {from: owner});
        await upgradeContract.connect(owner).execute();
        // Reload contracts from deployment as some were upgraded
        await artifacts.loadFromDeployment(rocketStorageAddress);
    }

    it(printTitle('node', 'can create megapool and deposit'), async () => {
        await registerNode({ from: node });

        await executeUpgrade();

        await deployMegapool({ from: node });
        await nodeDeposit(false, false, { value: '4'.ether, from: node });
    });
});