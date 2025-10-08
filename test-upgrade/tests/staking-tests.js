import { executeUpgrade } from '../_helpers/upgrade';
import { RocketDAOProtocolSettingsNode, RocketNetworkVoting, RocketNodeStaking } from '../../test/_utils/artifacts';
import { assertBN } from '../../test/_helpers/bn';
import { stakeMinipool } from '../../test/_helpers/minipool';
import { createMinipool } from '../_helpers/minipool';
import { userDeposit } from '../../test/_helpers/deposit';
import { nodeDeposit } from '../../test/_helpers/megapool';
import { BigSqrt } from '../../test/_helpers/bigmath';
import { submitPrices } from '../../test/network/scenario-submit-prices';
import { setNodeTrusted } from '../../test/_helpers/node';
import { shouldRevert } from '../../test/_utils/testing';
import { setDAOProtocolBootstrapSetting } from '../../test/dao/scenario-dao-protocol-bootstrap';

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
            trustedNode1,
            trustedNode2,
            trustedNode3,
            random;

        let upgradeContract;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                nodeWithdrawalAddress,
                trustedNode1,
                trustedNode2,
                trustedNode3,
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

        it(printTitle('node', 'can unstake legacy staked RPL down to 15% of borrowed ETH'), async () => {
            // Register node
            await registerNode({ from: node });
            // Register trusted nodes
            await registerNode({ from: trustedNode1 });
            await registerNode({ from: trustedNode2 });
            await registerNode({ from: trustedNode3 });
            await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);
            await setNodeTrusted(trustedNode2, 'saas_2', 'node@home.com', owner);
            await setNodeTrusted(trustedNode3, 'saas_3', 'node@home.com', owner);
            // Set RPL price to 0.1 ETH
            let block = await ethers.provider.getBlockNumber();
            let slotTimestamp = '1600000000';
            let rplPrice = '0.1'.ether;
            await submitPrices(block, slotTimestamp, rplPrice, { from: trustedNode1 });
            await submitPrices(block, slotTimestamp, rplPrice, { from: trustedNode2 });
            await submitPrices(block, slotTimestamp, rplPrice, { from: trustedNode3 });
            // Mint 1000 RPL and stake
            await mintRPL(owner, node, '1000'.ether);
            await stakeRPL(node, '1000'.ether);
            // Create a 8 ETH minipool
            const minipool = (await createMinipool({ from: node, value: '8'.ether })).connect(node);
            // Perform a user deposit with enough to assign the minipool
            await userDeposit({ from: random, value: '24'.ether });
            // Confirm prelaunch status
            const status = await minipool.getStatus();
            assertBN.equal(status, 1n)
            // Execute upgrade
            await executeUpgrade(owner, upgradeContract, rocketStorageAddress);
            // Set minimum stake setting to 15%
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, "node.minimum.legacy.staked.rpl", '0.15'.ether, { from: owner });
            // Check minimum stake
            /**
             * With 1x 8 ETH minipool, borrowed ETH is 24 ETH
             * At 0.1 ETH per RPL, the minimum should be 15% of 240 RPL
             * Minimum is therefore 36 RPL
             */
            const rocketNodeStaking = await RocketNodeStaking.deployed();
            const minimumStake = await rocketNodeStaking.getNodeMinimumLegacyRPLStake(node.address);
            assertBN.equal(minimumStake, '36'.ether);
            // Should not be able to unstake below 36 RPL (1000 - 36 = 964)
            await shouldRevert(
                unstakeLegacyRpl('965'.ether, { from: node }),
                'Was able to unstake below 15% minimum',
                'Insufficient legacy staked RPL'
            );
            // Should be able to unstake to 36 RPL
            await unstakeLegacyRpl('964'.ether, { from: node });
            // Should not be able to unstake any more
            await shouldRevert(
                unstakeLegacyRpl(1n, { from: node }),
                'Was able to unstake below 15% minimum',
                'Insufficient legacy staked RPL'
            );
        });
    });
}
