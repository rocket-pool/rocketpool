import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { RevertOnTransfer, RocketNodeDistributorFactory, RocketNodeManager } from '../_utils/artifacts';
import { registerNode, setNodeTrusted, setNodeWithdrawalAddress } from '../_helpers/node';
import { distributeRewards } from './scenario-distribute-rewards';
import { globalSnapShot } from '../_utils/snapshotting';
import { assertBN } from '../_helpers/bn';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNodeDistributor', () => {
        let owner,
            node1,
            node2,
            trustedNode,
            random;

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
            // Register node
            await registerNode({ from: node1 });
            distributorAddress = await rocketNodeDistributorFactory.getProxyAddress(node1);
            // Register trusted node
            await registerNode({ from: trustedNode });
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);
            // The protocol no longer automatically deploys a fee distributor as it is not used for megapools
            const rocketNodeManager = await RocketNodeManager.deployed();
            await rocketNodeManager.connect(node1).initialiseFeeDistributor();
        });

        it(printTitle('node operator', 'can claim unclaimed rewards when ETH transfer to withdrawal address fails'), async () => {
            // Enable reverting on transfer helper
            const revertOnTransfer = await RevertOnTransfer.deployed();
            await revertOnTransfer.setEnabled(true);
            // Set node withdrawal address to reverting helper
            await setNodeWithdrawalAddress(node1.address, revertOnTransfer.target, { from: node1 });
            // Send some funds to the distributor
            await owner.sendTransaction({
                to: distributorAddress,
                value: '1'.ether,
            });
            // Distributing rewards should not fail
            await distributeRewards(node1, { from: owner });
            // Check unclaimed rewards was increased
            const rocketNodeManager = await RocketNodeManager.deployed();
            const unclaimedRewardsBefore = await rocketNodeManager.getUnclaimedRewards(node1.address);
            // The default capital ratio is 1:1 with 0% fee, therefore NO should have 0.5 ETH unclaimed
            assertBN.equal(unclaimedRewardsBefore, '0.5'.ether);
            // Disable revert
            await revertOnTransfer.setEnabled(false);
            // Try to claim
            await rocketNodeManager.connect(node1).claimUnclaimedRewards(node1.address);
            const unclaimedRewardsAfter = await rocketNodeManager.getUnclaimedRewards(node1.address);
            // Should be no unclaimed rewards now
            assertBN.equal(unclaimedRewardsAfter, '0'.ether);
            // Withdrawal address should now have the 0.5 ETH
            const withdrawalAddressBalance = await ethers.provider.getBalance(revertOnTransfer.target)
            assertBN.equal(withdrawalAddressBalance, '0.5'.ether);
        });

    });
}
