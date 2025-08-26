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
    RocketDAOProtocolSettingsNode, RocketDAOProtocolSettingsSecurity,
    RocketNetworkRevenues,
    RocketStorage,
} from '../../test/_utils/artifacts';
import { setDefaultParameters } from '../../test/_helpers/defaults';
import { printTitle } from '../../test/_utils/formatting';
import assert from 'assert';
import { registerNode } from '../../test/_helpers/node';
import { userDeposit } from '../../test/_helpers/deposit';
import { deployMegapool, getMegapoolForNode, getValidatorInfo, nodeDeposit } from '../../test/_helpers/megapool';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

const rocketStorageAddress = process.env.ROCKET_STORAGE || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

export default function() {
    describe('Misc', () => {
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

        beforeEach(async () => {
            await artifacts.loadFromDeployment(rocketStorageAddress);
        });

        it(printTitle('upgrade', 'updates expected settings'), async () => {
            await executeUpgrade(owner, upgradeContract, rocketStorageAddress);
            const upgradeBlock = await ethers.provider.getBlockNumber();

            const rocketDAOProtocolSettingsDeposit = await RocketDAOProtocolSettingsDeposit.deployed();
            const rocketDAOProtocolSettingsMegapool = await RocketDAOProtocolSettingsMegapool.deployed();
            const rocketDAOProtocolSettingsMinipool = await RocketDAOProtocolSettingsMinipool.deployed();
            const rocketDAOProtocolSettingsNetwork = await RocketDAOProtocolSettingsNetwork.deployed();
            const rocketDAOProtocolSettingsNode = await RocketDAOProtocolSettingsNode.deployed();
            const rocketDAOProtocolSettingsSecurity = await RocketDAOProtocolSettingsSecurity.deployed();
            const rocketStorage = await RocketStorage.deployed();
            const rocketNetworkRevenues = await RocketNetworkRevenues.deployed();

            // RPIP-46 / RPIP-72
            assertBN.equal(await rocketNetworkRevenues.getCurrentNodeShare(), '0.05'.ether);
            assertBN.equal(await rocketNetworkRevenues.getCurrentProtocolDAOShare(), '0'.ether);
            assertBN.equal(await rocketNetworkRevenues.getCurrentVoterShare(), '0.09'.ether);
            assertBN.equal(await rocketDAOProtocolSettingsNetwork.getNodeShare(), '0.05'.ether);
            assertBN.equal(await rocketDAOProtocolSettingsNetwork.getVoterShare(), '0.09'.ether);
            assertBN.equal(await rocketDAOProtocolSettingsNetwork.getProtocolDAOShare(), '0'.ether);
            assertBN.equal(await rocketDAOProtocolSettingsNetwork.getMaxNodeShareSecurityCouncilAdder(), '0.01'.ether);
            assertBN.equal(await rocketDAOProtocolSettingsNetwork.getNodeShareSecurityCouncilAdder(), '0'.ether);
            assert.equal((await rocketDAOProtocolSettingsNetwork.getAllowListedControllers()).length, 0);

            // RPIP-58
            assertBN.equal(await rocketDAOProtocolSettingsMinipool.getMaximumPenaltyCount(), 2500n);

            // RPIP-61
            assertBN.equal(await rocketDAOProtocolSettingsNetwork.getMaxRethDelta(), '0.02'.ether);

            // RPIP-42
            assertBN.equal(await rocketDAOProtocolSettingsMegapool.getMaximumEthPenalty(), '612'.ether);
            assertBN.equal(await rocketDAOProtocolSettingsNode.getReducedBond(), '4'.ether);
            const baseBondArray = await rocketDAOProtocolSettingsNode.getBaseBondArray();
            assert.equal(baseBondArray.length, 2);
            assertBN.equal(baseBondArray[0], '4'.ether);
            assertBN.equal(baseBondArray[1], '8'.ether);

            // RPIP-30
            assertBN.equal(await rocketDAOProtocolSettingsNode.getUnstakingPeriod(), 60 * 60 * 24 * 28);

            // RPIP-59 / RPIP-72
            assertBN.equal(await rocketDAOProtocolSettingsDeposit.getExpressQueueRate(), 2n);
            assertBN.equal(await rocketDAOProtocolSettingsDeposit.getExpressQueueTicketsBaseProvision(), 2n);
            assertBN.equal(await rocketDAOProtocolSettingsMegapool.getTimeBeforeDissolve(), 60 * 60 * 24 * 28);

            // RPIP-60
            assertBN.equal(await rocketDAOProtocolSettingsSecurity.getUpgradeDelay(), 60 * 60 * 24 * 7);
            assertBN.equal(await rocketDAOProtocolSettingsSecurity.getUpgradeVetoQuorum(), '0.33'.ether);

            // RPIP-72
            assertBN.equal(await rocketDAOProtocolSettingsMegapool.getNotifyThreshold(), 60 * 60 * 12);
            assertBN.equal(await rocketDAOProtocolSettingsMegapool.getLateNotifyFine(), '0.05'.ether);
            assertBN.equal(await rocketDAOProtocolSettingsMegapool.getUserDistributeWindowLength(), 60 * 60 * 24 * 7);

            // Check protocol version string is set to 1.4
            assert.equal(await rocketStorage.getString(ethers.solidityPackedKeccak256(['string'], ['protocol.version'])), '1.4');

            // Check revenue split
            const split = await rocketNetworkRevenues.calculateSplit(upgradeBlock);
            assertBN.equal(split[0], '0.05'.ether); // Node share
            assertBN.equal(split[1], '0.09'.ether); // Voter share
            assertBN.equal(split[2], '0'.ether);    // Protocol share
            assertBN.equal(split[3], '0.86'.ether); // User share
        });

        it(printTitle('node', 'can create megapool and deposit from a node registered before upgrade'), async () => {
            await registerNode({ from: node });
            await userDeposit({ from: random, value: '28'.ether });

            await executeUpgrade(owner, upgradeContract, rocketStorageAddress);

            await deployMegapool({ from: node });
            await nodeDeposit(node);

            const megapool = await getMegapoolForNode(node);

            const validatorInfoAfter = await getValidatorInfo(megapool, 0);
            assert.equal(validatorInfoAfter.staked, false);
            assert.equal(validatorInfoAfter.inPrestake, true);
            assert.equal(validatorInfoAfter.inQueue, false);
        });
    });
}