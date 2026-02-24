import { assertBN } from '../../test/_helpers/bn';
import { before, beforeEach, describe, it } from 'mocha';
import { globalSnapShot } from '../../test/_utils/snapshotting';
import { deployUpgrade, executeUpgrade } from '../_helpers/upgrade';
import {
    artifacts, RocketDAONodeTrusted, RocketDAONodeTrustedUpgrade,
    RocketDAOProtocolSettingsDeposit,
    RocketDAOProtocolSettingsMegapool,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsNode,
    RocketDAOProtocolSettingsProposals,
    RocketDAOProtocolSettingsSecurity,
    RocketNetworkRevenues,
    RocketStorage, RocketUpgradeOneDotFour,
} from '../../test/_utils/artifacts';
import { setDefaultParameters } from '../../test/_helpers/defaults';
import { printTitle } from '../../test/_utils/formatting';
import assert from 'assert';
import { registerNode, setNodeTrusted } from '../../test/_helpers/node';
import { userDeposit } from '../../test/_helpers/deposit';
import { deployMegapool, getMegapoolForNode, getValidatorInfo, nodeDeposit } from '../../test/_helpers/megapool';
import { setDAOProtocolBootstrapSetting } from '../../test/dao/scenario-dao-protocol-bootstrap';
import { compressABI } from '../../test/_utils/contract';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

const rocketStorageAddress = process.env.ROCKET_STORAGE || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const rocketUpgradeOneDotFourDissolveHotfix = artifacts.require('RocketUpgradeOneDotFourDissolveHotfix');

async function executeHotfix(rocketStorageAddress, trustedNode, owner) {
    // Get contracts
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const rocketDAONodeTrustedUpgrade = await RocketDAONodeTrustedUpgrade.deployed()

    // Deploy hotfix conract
    const dissolveHotfixContract = await rocketUpgradeOneDotFourDissolveHotfix.new(rocketStorageAddress);

    // Bootstrap add the upgrade contract and execute
    await rocketDAONodeTrusted.connect(owner).bootstrapUpgrade('addContract', 'rocketUpgradeOneDotFourDissolveHotfix', compressABI(RocketUpgradeOneDotFour.abi), dissolveHotfixContract.target);
    const upgradeProposalId = await rocketDAONodeTrustedUpgrade.getTotal()

    // Wait for the SC veto window to end
    const vetoEnd = await rocketDAONodeTrustedUpgrade.getEnd(upgradeProposalId);
    await helpers.time.increaseTo(vetoEnd + 1n);

    // Execute the upgrade
    await rocketDAONodeTrustedUpgrade.connect(trustedNode).execute(upgradeProposalId);

    // Execute the hotfix
    await dissolveHotfixContract.connect(owner).execute();
}

export default function() {
    describe('Dissolve Hotfix', () => {
        let owner,
            node,
            nodeWithdrawalAddress,
            trustedNode1,
            random;

        let upgradeContract;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                nodeWithdrawalAddress,
                trustedNode1,
                random,
            ] = await ethers.getSigners();

            // Deploy upgrade while global artifacts are still latest version
            upgradeContract = await deployUpgrade(rocketStorageAddress);
            // Load artifacts from old deployment and initialise default parameters
            await artifacts.loadFromDeployment(rocketStorageAddress);
            await setDefaultParameters();
        });

        beforeEach(async () => {
            await artifacts.loadFromDeployment(rocketStorageAddress);
        });

        it(printTitle('hotfix', 'updated megapool.time.before.dissolve to 365 days'), async () => {
            // Setup a trusted node to execute the upgrade
            await registerNode({ from: trustedNode1 });
            await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);

            // Execute the upgrade
            await executeUpgrade(owner, upgradeContract, rocketStorageAddress);

            // Get contracts
            const rocketDAOProtocolSettingsMegapool = await RocketDAOProtocolSettingsMegapool.deployed();

            // Check setting before is 28 days
            assertBN.equal(await rocketDAOProtocolSettingsMegapool.getTimeBeforeDissolve(), 60 * 60 * 24 * 28);

            // Execute hotfix
            await executeHotfix(rocketStorageAddress, trustedNode1, owner);

            // Check setting after is 365 days
            assertBN.equal(await rocketDAOProtocolSettingsMegapool.getTimeBeforeDissolve(), 60 * 60 * 24 * 365);
        });
    });
}