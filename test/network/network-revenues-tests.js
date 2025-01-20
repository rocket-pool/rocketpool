import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { RocketDAOProtocolSettingsNetwork, RocketNetworkRevenues } from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { assertBN } from '../_helpers/bn';
import { globalSnapShot } from '../_utils/snapshotting';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNetworkRevenues', () => {
        let owner;

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
            ] = await ethers.getSigners();
        });

        it(printTitle('revenue split', 'calculates correct time weighted average node share'), async () => {
            const rocketNetworkRevenues = await RocketNetworkRevenues.deployed();
            // Initial value should be 5%
            const shareBefore = await rocketNetworkRevenues.getCurrentNodeShare();
            assertBN.equal(shareBefore, '0.05'.ether);
            // Set value to 10% and check
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, "network.node.commission.share", '0.10'.ether, { from: owner });
            const shareAfter = await rocketNetworkRevenues.getCurrentNodeShare();
            assertBN.equal(shareAfter, '0.10'.ether);
            // Mine 2 blocks
            await helpers.mine(2);
            // Get calculated shares
            const currentBlock = await ethers.provider.getBlockNumber();
            const calculatedShare = await rocketNetworkRevenues.calculateSplit(currentBlock - 3);
            // 1 day of 5% and 2 days of 10% should average out to 8.33% (math is done in 3 decimal fixed point)
            assertBN.equal(calculatedShare[0], '0.08333'.ether);
        });

        it(printTitle('revenue split', 'calculates correct shares when using the adder'), async () => {
            const rocketNetworkRevenues = await RocketNetworkRevenues.deployed();
            const rocketDAOProtocolSettingsNetwork = await RocketDAOProtocolSettingsNetwork.deployed();
            // Increment the adder by 0.5%
            const adder = '0.005'.ether;
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, "network.node.commission.share.security.council.adder", adder, { from: owner });
            // Check node share
            const effectiveNodeShare = await rocketDAOProtocolSettingsNetwork.getEffectiveNodeShare();
            assertBN.equal(effectiveNodeShare, '0.05'.ether + adder);
            const nodeShare = await rocketNetworkRevenues.getCurrentNodeShare();
            assertBN.equal(nodeShare, '0.05'.ether + adder);
            // Check voter share
            const effectiveVoterShare = await rocketDAOProtocolSettingsNetwork.getEffectiveVoterShare();
            assertBN.equal(effectiveVoterShare, '0.09'.ether - adder);
            const voterShare = await rocketNetworkRevenues.getCurrentVoterShare();
            assertBN.equal(voterShare, '0.09'.ether - adder);
        });

        it(printTitle('revenue split', 'calculates correct time weighted average node share after adder is used'), async () => {
            const rocketNetworkRevenues = await RocketNetworkRevenues.deployed();
            // Initial value should be 5%
            const shareBefore = await rocketNetworkRevenues.getCurrentNodeShare();
            assertBN.equal(shareBefore, '0.05'.ether);
            // Set value to 10% and check
            const adder = '0.005'.ether;
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, "network.node.commission.share.security.council.adder", adder, { from: owner });
            const shareAfter = await rocketNetworkRevenues.getCurrentNodeShare();
            assertBN.equal(shareAfter, '0.05'.ether + adder);
            // Mine 2 blocks
            await helpers.mine(2);
            // Get calculated shares
            const currentBlock = await ethers.provider.getBlockNumber();
            const calculatedShare = await rocketNetworkRevenues.calculateSplit(currentBlock - 3);
            // 1 day of 5% and 2 days of 5.5% should average out to 5.33% (math is done in 3 decimal fixed point)
            assertBN.equal(calculatedShare[0], '0.05333'.ether);
        });
    });
}
