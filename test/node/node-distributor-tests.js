import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketNodeDistributorFactory,
    RocketNodeManager,
} from '../_utils/artifacts';
import { createMinipool, getMinipoolMinimumRPLStake, stakeMinipool } from '../_helpers/minipool';
import { nodeStakeRPL, registerNode, setNodeTrusted } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { distributeRewards } from './scenario-distribute-rewards';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { shouldRevert } from '../_utils/testing';
import { userDeposit } from '../_helpers/deposit';
import { globalSnapShot } from '../_utils/snapshotting';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    // TODO: Migrate to upgrade tests once implemented for Saturn
    describe.skip('RocketNodeDistributor', () => {
        let owner,
            node1,
            node2,
            trustedNode,
            random;

        const scrubPeriod = (60 * 60 * 24); // 24 hours

        let distributorAddress;
        let rplStake;

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
                node1,
                node2,
                trustedNode,
                random,
            ] = await ethers.getSigners();

            // Get contracts
            const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();
            // Set settings
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, { from: owner });
            // Register node
            await registerNode({ from: node1 });
            distributorAddress = await rocketNodeDistributorFactory.getProxyAddress(node1);
            // Register trusted node
            await registerNode({ from: trustedNode });
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);
            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            rplStake = minipoolRplStake * 7n;
            await mintRPL(owner, node1, rplStake);
            await nodeStakeRPL(rplStake, { from: node1 }, true);
            await mintRPL(owner, node2, rplStake);
        });

        it(printTitle('node operator', 'can not initialise fee distributor if registered after upgrade'), async () => {
            // Register node
            await registerNode({ from: node2 });
            await nodeStakeRPL(rplStake, { from: node2 });
            // Get contracts
            const rocketNodeManager = await RocketNodeManager.deployed();
            // Attempt to initialise
            await shouldRevert(rocketNodeManager.connect(node2).initialiseFeeDistributor(), 'Was able to initialise again', 'Already initialised');
        });

        it(printTitle('node operator', 'can not initialise fee distributor if already initialised'), async () => {
            // Attempt to initialise a second time
            const rocketNodeManager = await RocketNodeManager.deployed();
            await shouldRevert(rocketNodeManager.connect(node1).initialiseFeeDistributor(), 'Was able to initialise again', 'Already initialised');
        });

        it(printTitle('node operator', 'can distribute rewards with no minipools'), async () => {
            // Send ETH and distribute
            await owner.sendTransaction({
                to: distributorAddress,
                value: '1'.ether,
            });
            await distributeRewards(node2, { from: owner });
        });

        it(printTitle('node operator', 'can distribute rewards with 1 minipool'), async () => {
            // Get contracts
            const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();
            // Register node
            await registerNode({ from: node2 });
            await nodeStakeRPL(rplStake, { from: node2 });
            const distributorAddress2 = await rocketNodeDistributorFactory.getProxyAddress(node2);
            // Create and stake a minipool
            await userDeposit({ from: random, value: '16'.ether });
            let stakingMinipool = await createMinipool({ from: node2, value: '16'.ether });
            await helpers.time.increase(scrubPeriod + 1);
            await stakeMinipool(stakingMinipool, { from: node2 });
            // Distribute
            await owner.sendTransaction({
                to: distributorAddress2,
                value: '1'.ether,
            });
            await distributeRewards(node2, { from: owner });
        });

        it(printTitle('node operator', 'can distribute rewards with multiple minipools'), async () => {
            // Get contracts
            const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();
            // Register node
            await registerNode({ from: node2 });
            await nodeStakeRPL(rplStake, { from: node2 });
            const distributorAddress2 = await rocketNodeDistributorFactory.getProxyAddress(node2);
            // Create and stake a minipool
            await userDeposit({ from: random, value: '32'.ether });
            let stakingMinipool1 = await createMinipool({ from: node2, value: '16'.ether });
            let stakingMinipool2 = await createMinipool({ from: node2, value: '16'.ether });
            await helpers.time.increase(scrubPeriod + 1);
            await stakeMinipool(stakingMinipool1, { from: node2 });
            await stakeMinipool(stakingMinipool2, { from: node2 });

            await owner.sendTransaction({
                to: distributorAddress2,
                value: '1'.ether,
            });
            await distributeRewards(node2, { from: owner });
        });

        it(printTitle('node operator', 'can distribute rewards after staking and withdrawing'), async () => {
            // Get contracts
            const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();
            // Register node
            await registerNode({ from: node2 });
            await nodeStakeRPL(rplStake, { from: node2 });
            const distributorAddress2 = await rocketNodeDistributorFactory.getProxyAddress(node2);
            // Create and stake a minipool
            await userDeposit({ from: random, value: '32'.ether });
            let stakingMinipool1 = await createMinipool({ from: node2, value: '16'.ether });
            let stakingMinipool2 = await createMinipool({ from: node2, value: '16'.ether });
            await helpers.time.increase(scrubPeriod + 1);
            await stakeMinipool(stakingMinipool1, { from: node2 });
            await stakeMinipool(stakingMinipool2, { from: node2 });

            // Mark minipool as withdrawable to remove it from the average fee calculation
            // await submitMinipoolWithdrawable(stakingMinipool1.address, {from: trustedNode});

            await owner.sendTransaction({
                to: distributorAddress2,
                value: '1'.ether,
            });
            await distributeRewards(node2, { from: owner });
        });
    });
}
