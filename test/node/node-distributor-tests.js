import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { RevertOnTransfer, RocketNodeDistributorFactory, RocketNodeManager } from '../_utils/artifacts';
import { registerNode, setNodeTrusted, setNodeWithdrawalAddress } from '../_helpers/node';
import { distributeRewards } from './scenario-distribute-rewards';
import { globalSnapShot } from '../_utils/snapshotting';
import { assertBN } from '../_helpers/bn';
import { shouldRevert } from '../_utils/testing';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNodeDistributor', () => {
        let owner,
            node1,
            node2,
            node1WithdrawalAddress,
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
                node1WithdrawalAddress,
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

        it(printTitle('random', 'can distribute rewards'), async () => {
            // Send some funds to the distributor
            await owner.sendTransaction({
                to: distributorAddress,
                value: '1'.ether,
            });
            // Distributing rewards should not fail
            await distributeRewards(node1, { from: random });
            // Check unclaimed rewards was increased
            const rocketNodeManager = await RocketNodeManager.deployed();
            const unclaimedRewards = await rocketNodeManager.getUnclaimedRewards(node1.address);
            // The default capital ratio is 1:1 with 0% fee, therefore NO should have 0.5 ETH unclaimed
            assertBN.equal(unclaimedRewards, '0.5'.ether);
        });

        it(printTitle('node', 'can not manually add unclaimed rewards'), async () => {
            const rocketNodeManager = await RocketNodeManager.deployed();
            await shouldRevert(
                rocketNodeManager.connect(node1).addUnclaimedRewards(node1.address, { value: '1'.ether }),
                'Was able to call addUnclaimedRewards',
                'Only distributor can add unclaimed rewards'
            );
        });

        it(printTitle('node', 'can distribute rewards directly to withdrawal address'), async () => {
            // Set node withdrawal address to reverting helper
            await setNodeWithdrawalAddress(node1.address, node1WithdrawalAddress.address, { from: node1 });
            // Send some funds to the distributor
            await owner.sendTransaction({
                to: distributorAddress,
                value: '1'.ether,
            });
            // Get withdrawal address balance before
            const withdrawalAddressBalanceBefore = await ethers.provider.getBalance(node1WithdrawalAddress.address)
            // Distributing rewards should not fail
            await distributeRewards(node1, { from: node1 });
            // Check unclaimed rewards was increased
            const rocketNodeManager = await RocketNodeManager.deployed();
            const unclaimedRewards = await rocketNodeManager.getUnclaimedRewards(node1.address);
            // Should be no unclaimed rewards
            assertBN.equal(unclaimedRewards, '0'.ether);
            // Withdrawal address should now have the 0.5 ETH
            const withdrawalAddressBalanceAfter = await ethers.provider.getBalance(node1WithdrawalAddress.address)
            assertBN.equal(withdrawalAddressBalanceAfter - withdrawalAddressBalanceBefore, '0.5'.ether);
        });

        describe('With unclaimed rewards from reverting withdrawal contract', () => {

            let revertOnTransfer;

            before(async () => {
                // Enable reverting on transfer helper
                revertOnTransfer = await RevertOnTransfer.deployed();
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
                const unclaimedRewards = await rocketNodeManager.getUnclaimedRewards(node1.address);
                // The default capital ratio is 1:1 with 0% fee, therefore NO should have 0.5 ETH unclaimed
                assertBN.equal(unclaimedRewards, '0.5'.ether);
                // Disable revert
                await revertOnTransfer.setEnabled(false);
            })

            it(printTitle('node operator', 'can claim unclaimed rewards'), async () => {
                // Try to claim
                const rocketNodeManager = await RocketNodeManager.deployed();
                await rocketNodeManager.connect(node1).claimUnclaimedRewards(node1.address);
                const unclaimedRewards = await rocketNodeManager.getUnclaimedRewards(node1.address);
                // Should be no unclaimed rewards now
                assertBN.equal(unclaimedRewards, '0'.ether);
                // Withdrawal address should now have the 0.5 ETH
                const withdrawalAddressBalance = await ethers.provider.getBalance(revertOnTransfer.target)
                assertBN.equal(withdrawalAddressBalance, '0.5'.ether);
            });

            it(printTitle('random', 'can not claim unclaimed rewards'), async () => {
                // Try to claim
                const rocketNodeManager = await RocketNodeManager.deployed();
                await shouldRevert(
                    rocketNodeManager.connect(random).claimUnclaimedRewards(node1.address),
                    'Was able to claim',
                    'Only node can claim'
                );
            });
        })


    });
}
