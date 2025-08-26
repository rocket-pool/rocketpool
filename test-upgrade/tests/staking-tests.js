import { executeUpgrade } from '../_helpers/upgrade';
import { RocketNetworkVoting, RocketNodeStaking } from '../../test/_utils/artifacts';
import { assertBN } from '../../test/_helpers/bn';
import { getMinipoolMinimumRPLStake, stakeMinipool } from '../../test/_helpers/minipool';
import { createMinipool } from '../_helpers/minipool';
import { userDeposit } from '../../test/_helpers/deposit';
import { nodeDeposit } from '../../test/_helpers/megapool';
import { BigSqrt } from '../../test/_helpers/bigmath';

const { beforeEach, describe, before, it } = require('mocha');
const { globalSnapShot } = require('../../test/_utils/snapshotting');
const { deployUpgrade } = require('../_helpers/upgrade');
const { artifacts } = require('../../test/_utils/artifacts');
const { setDefaultParameters } = require('../../test/_helpers/defaults');
const { printTitle } = require('../../test/_utils/formatting');
const { registerNode } = require('../../test/_helpers/node');
const { mintRPL } = require('../../test/_helpers/tokens');
const { stakeRPL } = require('../_helpers/stake');
const { unstakeLegacyRpl } = require('../../test/node/scenario-unstake-legacy-rpl');
const { withdrawRpl } = require('../../test/node/scenario-withdraw-rpl');

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

const rocketStorageAddress = process.env.ROCKET_STORAGE || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

export default function() {
    describe('Legacy Staking', () => {
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

        it(printTitle('node', 'can withdraw legacy RPL'), async () => {
            // Register node
            await registerNode({ from: node });
            // Mint RPL and stake
            await mintRPL(owner, node, '100'.ether);
            await stakeRPL(node, '100'.ether);
            // Execute upgrade
            await executeUpgrade(owner, upgradeContract, rocketStorageAddress);
            // Unstake legacy RPL
            await unstakeLegacyRpl('100'.ether, { from: node });
            // Wait unstaking period
            await helpers.time.increase(60 * 60 * 24 * 28 + 1);
            // Withdraw legacy RPL
            await withdrawRpl({ from: node });
        });

        it(printTitle('node', 'can stake before and after upgrade'), async () => {
            // Register node
            await registerNode({ from: node });
            // Mint RPL and stake
            await mintRPL(owner, node, '300'.ether);
            await stakeRPL(node, '100'.ether);
            // Execute upgrade
            await executeUpgrade(owner, upgradeContract, rocketStorageAddress);
            // Stake some megapool staked RPL
            await stakeRPL(node, '200'.ether);
            // Check balances
            const rocketNodeStaking = await RocketNodeStaking.deployed();
            const legacyStakedRPL = await rocketNodeStaking.getNodeLegacyStakedRPL(node.address)
            const megapoolStakedRPL = await rocketNodeStaking.getNodeMegapoolStakedRPL(node.address)
            const totalStakedRPL = await rocketNodeStaking.getNodeStakedRPL(node.address)
            assertBN.equal(legacyStakedRPL, '100'.ether);
            assertBN.equal(megapoolStakedRPL, '200'.ether);
            assertBN.equal(totalStakedRPL, '300'.ether);
            // Voting power should be 0 with no validators
            const rocketNetworkVoting = await RocketNetworkVoting.deployed();
            const block = await ethers.provider.getBlockNumber();
            const votingPower = await rocketNetworkVoting.getVotingPower(node.address, block);
            assertBN.equal(votingPower, 0n)
        });

        it(printTitle('node', 'has correct voting power with both megapool and legacy staked RPL'), async () => {
            // Register node
            await registerNode({ from: node });
            // Mint RPL and stake
            const rplStake = '5000'.ether
            await mintRPL(owner, node, rplStake * 2n);
            await stakeRPL(node, rplStake);
            const minipool = (await createMinipool({ from: node, value: '16'.ether })).connect(node);
            // Execute upgrade
            await executeUpgrade(owner, upgradeContract, rocketStorageAddress);
            // Perform a user deposit with enough to assign the minipool
            await userDeposit({ from: random, value: '16'.ether });
            // Create a megapool (and actually assign the minipool validator)
            await nodeDeposit(node);
            // Stake another 5k in megapool staked
            await stakeRPL(node, rplStake);
            // Wait for scrub period
            await helpers.time.increase(60 * 60 * 12 + 1)
            // Stake minipool
            await stakeMinipool(minipool, {from: node})
            // Check voting power
            const rocketNetworkVoting = await RocketNetworkVoting.deployed();
            const block = await ethers.provider.getBlockNumber();
            const votingPower = await rocketNetworkVoting.getVotingPower(node.address, block);
            /**
             * NO has a 16 ETH minipool and a 4 ETH megapool validator and 10k RPL staked (5k legacy and 5k megapool)
             *
             * _rplStake = 10000 RPL
             * _bondedETH = 20 ETH
             * _rplPrice = 0.01 ETH
             * _maxStakePercent = 150%
             *
             * voting power = sqrt( min(10000, 20 * 1.5 / 0.01) )
             *              = sqrt( 3000 )
             *
             */
            assertBN.equal(votingPower, BigSqrt('3000'.ether * '1'.ether));
        });
    });
}
