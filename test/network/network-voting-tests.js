import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { RocketNetworkSnapshots, RocketNetworkVoting } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import { nodeStakeRPL, registerNode } from '../_helpers/node';
import { createMinipool, getMinipoolMaximumRPLStake } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import { globalSnapShot } from '../_utils/snapshotting';
import { BigSqrt } from '../_helpers/bigmath';
import { nodeDeposit, nodeDepositMulti } from '../_helpers/megapool';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNetworkVoting', () => {
        let owner,
            node,
            random;

        let networkSnapshots;
        let networkVoting;

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                random,
            ] = await ethers.getSigners();

            // Get contracts
            networkSnapshots = await RocketNetworkSnapshots.deployed();
            networkVoting = await RocketNetworkVoting.deployed();

            // Register node & set withdrawal address
            await registerNode({ from: node });

            // Stake RPL for voting power
            let rplStake = '1200'.ether;
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, { from: node });

            // Add some ETH into the DP
            await userDeposit({ from: random, value: '320'.ether });
        });

        it(printTitle('Voting Power', 'Should correctly snapshot values'), async () => {
            // Create a minipool to set the active count to non-zero
            await nodeDeposit(node, '4'.ether, false);
            const blockBefore = (await ethers.provider.getBlockNumber());
            await nodeDeposit(node, '4'.ether, false);
            const blockAfter = (await ethers.provider.getBlockNumber());

            const votingPowerBefore = await networkVoting.getVotingPower(node, blockBefore);
            const votingPowerAfter = await networkVoting.getVotingPower(node, blockAfter);

            assertBN.equal(votingPowerBefore, BigSqrt('600'.ether * '1'.ether));
            assertBN.equal(votingPowerAfter, BigSqrt('1200'.ether * '1'.ether));
        });
    });
}
