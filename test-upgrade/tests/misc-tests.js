import { assertBN } from '../../test/_helpers/bn';
import { before, beforeEach, describe, it } from 'mocha';
import { globalSnapShot } from '../../test/_utils/snapshotting';
import { deployUpgrade, executeUpgrade } from '../_helpers/upgrade';
import {
    artifacts,
    RocketDAOProtocolSettingsDeposit,
    RocketDAOProtocolSettingsMegapool,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsNode, RocketDAOProtocolSettingsProposals, RocketDAOProtocolSettingsSecurity,
    RocketNetworkRevenues,
    RocketStorage,
} from '../../test/_utils/artifacts';
import { setDefaultParameters } from '../../test/_helpers/defaults';
import { printTitle } from '../../test/_utils/formatting';
import assert from 'assert';
import { registerNode, setNodeTrusted } from '../../test/_helpers/node';
import { userDeposit } from '../../test/_helpers/deposit';
import { deployMegapool, getMegapoolForNode, getValidatorInfo, nodeDeposit } from '../../test/_helpers/megapool';
import { setDAOProtocolBootstrapSetting } from '../../test/dao/scenario-dao-protocol-bootstrap';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

const rocketStorageAddress = process.env.ROCKET_STORAGE || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

export default function() {
    describe('Misc', () => {
        let owner,
            trustedNode1,
            node,
            nodeWithdrawalAddress,
            random;

        let upgradeContract;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                trustedNode1,
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

        beforeEach(async () => {
            await artifacts.loadFromDeployment(rocketStorageAddress);
        });

        it(printTitle('upgrade', 'updates expected settings'), async () => {
            // Setup trusted node
            await registerNode({ from: trustedNode1 });
            await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);

            await executeUpgrade(owner, trustedNode1, upgradeContract, rocketStorageAddress);
            const upgradeTime = await helpers.time.latest();

            const rocketDAOProtocolSettingsMegapool = await RocketDAOProtocolSettingsMegapool.deployed();
            const rocketDAOProtocolSettingsNetwork = await RocketDAOProtocolSettingsNetwork.deployed();
            const rocketStorage = await RocketStorage.deployed();

            // RPIP-71
            assertBN.equal(await rocketDAOProtocolSettingsNetwork.getDepositPoolCollateralTarget(), '0.01'.ether);
            assert.equal(await rocketDAOProtocolSettingsNetwork.getMegapoolExitPhase(), false);
            assertBN.equal(await rocketDAOProtocolSettingsNetwork.getStakingDelay(), 60 * 60 * 24 * 28);
            assertBN.equal(await rocketDAOProtocolSettingsNetwork.getTournamentSize(), 4);

            // RPIP-44
            assertBN.equal(await rocketDAOProtocolSettingsMegapool.getExitDeficit(), '0.2'.ether);

            // Check protocol version string is set to 1.5
            assert.equal(await rocketStorage.getString(ethers.solidityPackedKeccak256(['string'], ['protocol.version'])), '1.5');
        });
    });
}