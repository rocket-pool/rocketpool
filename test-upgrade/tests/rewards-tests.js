import { claimV0Rewards, submitV0Rewards } from '../_helpers/rewards';
import { setNodeTrusted } from '../../test/_helpers/node';
import { RocketSmoothingPool } from '../../test/_utils/artifacts';
import { executeUpgrade } from '../_helpers/upgrade';
import { submitRewards } from '../../test/rewards/scenario-submit-rewards';
import { claimRewards } from '../../test/rewards/scenario-claim-rewards';

const { beforeEach, describe, before, it } = require('mocha');
const { globalSnapShot } = require('../../test/_utils/snapshotting');
const { deployUpgrade } = require('../_helpers/upgrade');
const { artifacts } = require('../../test/_utils/artifacts');
const { setDefaultParameters } = require('../../test/_helpers/defaults');
const { printTitle } = require('../../test/_utils/formatting');
const { registerNode } = require('../../test/_helpers/node');

const hre = require('hardhat');
const ethers = hre.ethers;

const rocketStorageAddress = process.env.ROCKET_STORAGE || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

export default function() {
    describe('Legacy Rewards', () => {
        let owner,
            registeredNode1,
            registeredNode2,
            registeredTrustedNode1,
            registeredTrustedNode2,
            nodeWithdrawalAddress,
            random;

        let upgradeContract;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                registeredNode1,
                registeredNode2,
                registeredTrustedNode1,
                registeredTrustedNode2,
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

        it(printTitle('node', 'can claim v0 rewards'), async () => {
            // Register nodes
            await registerNode({ from: registeredNode1 });
            await registerNode({ from: registeredNode2 });
            // Setup oDAO
            await registerNode({ from: registeredTrustedNode1 });
            await registerNode({ from: registeredTrustedNode2 });
            await setNodeTrusted(registeredTrustedNode1, 'rp_1', 'test1@rocketpool.net', owner);
            await setNodeTrusted(registeredTrustedNode2, 'rp_2', 'test2@rocketpool.net', owner);
            // Send ETH to smoothing pool for use in rewards
            const rocketSmoothingPool = await RocketSmoothingPool.deployed();
            await owner.sendTransaction({
                to: rocketSmoothingPool.target,
                value: '20'.ether
            });
            // Submit a v0 reward tree
            const rewardsV0 = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '0'.ether,
                    nodeETH: '2'.ether,
                },
                {
                    address: registeredNode2.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '0'.ether,
                    nodeETH: '1'.ether,
                },
            ];
            await submitV0Rewards(0, rewardsV0, '0'.ether, '1'.ether, { from: registeredTrustedNode1 });
            await submitV0Rewards(0, rewardsV0, '0'.ether, '1'.ether, { from: registeredTrustedNode2 });
            // Execute upgrade
            await executeUpgrade(owner, upgradeContract, rocketStorageAddress);
            // Submit a v1 reward tree
            const rewardsV1 = [
                {
                    address: registeredNode1.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '0'.ether,
                    nodeETH: '2'.ether,
                    voterETH: 0n
                },
                {
                    address: registeredNode2.address,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '0'.ether,
                    nodeETH: '1'.ether,
                    voterETH: 0n
                },
            ];
            await submitRewards(1, rewardsV1, '0'.ether, '2'.ether, '0'.ether, { from: registeredTrustedNode1 });
            await submitRewards(1, rewardsV1, '0'.ether, '2'.ether, '0'.ether, { from: registeredTrustedNode2 });
            // Attempt to claim v1 from node 1
            await claimRewards(registeredNode1.address, [1], [rewardsV1], { from: registeredNode1 });
            // Attempt to claim v0 from node 1
            await claimV0Rewards(registeredNode1.address, [0], [rewardsV0], { from: registeredNode1 });
        });
    });
}
