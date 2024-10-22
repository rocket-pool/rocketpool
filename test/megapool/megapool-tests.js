import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { registerNode, setNodeWithdrawalAddress } from '../_helpers/node';
import { globalSnapShot } from '../_utils/snapshotting';
import { userDeposit } from '../_helpers/deposit';
import { deployMegapool, getMegapoolForNode, nodeDeposit } from '../_helpers/megapool';
import { shouldRevert } from '../_utils/testing';
import {
    MegapoolUpgradeHelper,
    RocketDAONodeTrustedSettingsMinipool,
    RocketMegapoolDelegate,
    RocketMegapoolFactory,
    RocketStorage,
} from '../_utils/artifacts';
import assert from 'assert';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe.only('Megapools', () => {
        let owner,
            node,
            nodeWithdrawalAddress,
            random;

        let megapool;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                nodeWithdrawalAddress,
                random,
            ] = await ethers.getSigners();

            // Register node & set withdrawal address
            await registerNode({ from: node });
            await setNodeWithdrawalAddress(node, nodeWithdrawalAddress, { from: node });

            megapool = await getMegapoolForNode(node);
        });

        //
        // Factory
        //

        it(printTitle('owner', 'can not initialise megapool factory again'), async () => {
            const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
            await shouldRevert(rocketMegapoolFactory.initialise(), 'Was able to initialise factory', 'Invalid or outdated network contract');
        });

        //
        // General
        //

        it(printTitle('node', 'can not upgrade to current delegate'), async () => {
            await deployMegapool({ from: node });
            await shouldRevert(megapool.delegateUpgrade(), 'Was able to upgrade delegate', 'Already using latest');
        });

        it(printTitle('random', 'can not manually deploy a megapool'), async () => {
            await shouldRevert(deployMegapool({ from: random }), 'Deployed megapool', 'Invalid node');
        });

        it(printTitle('node', 'can manually deploy a megapool then deposit'), async () => {
            await deployMegapool({ from: node });
            await nodeDeposit(false, false, { value: '4'.ether, from: node });
        });

        it(printTitle('node', 'can not deploy megapool twice'), async () => {
            await deployMegapool({ from: node });
            await shouldRevert(deployMegapool({ from: node }), 'Redeploy worked');
        });

        describe('With full deposit pool', () => {
            const dissolvePeriod = (60 * 60 * 24); // 24 hours

            before(async () => {
                // Deposit ETH into deposit pool
                await userDeposit({ from: random, value: '32'.ether });
                // Set scrub period
                await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'megapool.dissolve.period', dissolvePeriod, { from: owner });
            });

            it(printTitle('node', 'can not create a new validator while debt is present'), async () => {
                await deployMegapool({ from: node });
                await megapool.connect(owner).setDebt('1'.ether);
                await shouldRevert(nodeDeposit(false, false, {
                    value: '4'.ether,
                    from: node,
                }), 'Created validator', 'Cannot create validator while debt exists');
            });

            it(printTitle('node', 'can create new validators per bond requirements'), async () => {
                await shouldRevert(nodeDeposit(false, false, { value: '8'.ether, from: node }), 'Created validator', 'Bond requirement not met');
                await shouldRevert(nodeDeposit(false, false, { value: '2'.ether, from: node }), 'Created validator', 'Bond requirement not met');
                await nodeDeposit(false, false, { value: '4'.ether, from: node });
                await shouldRevert(nodeDeposit(false, false, { value: '2'.ether, from: node }), 'Created validator', 'Bond requirement not met');
                await nodeDeposit(false, false, { value: '4'.ether, from: node });
                await shouldRevert(nodeDeposit(false, false, { value: '2'.ether, from: node }), 'Created validator', 'Bond requirement not met');
                await nodeDeposit(false, false, { value: '4'.ether, from: node });
                await shouldRevert(nodeDeposit(false, false, { value: '2'.ether, from: node }), 'Created validator', 'Bond requirement not met');
            });

            it(printTitle('node', 'can not consume more than 2 provisioned express tickets'), async () => {
                await nodeDeposit(true, false, { value: '4'.ether, from: node });
                await nodeDeposit(true, false, { value: '4'.ether, from: node });
                await shouldRevert(nodeDeposit(true, false, { value: '4'.ether, from: node }), 'Consumed express ticket', 'No express tickets');
            });

            it(printTitle('node', 'can create a new validator without an express ticket'), async () => {
                await nodeDeposit(false, false, { value: '4'.ether, from: node });
            });

            it(printTitle('node', 'can create a new validator with an express ticket'), async () => {
                await nodeDeposit(true, false, { value: '4'.ether, from: node });
            });

            it(printTitle('random', 'can not dissolve validator before dissolve period ends'), async () => {
                await nodeDeposit(false, false, { value: '4'.ether, from: node });
                await shouldRevert(megapool.connect(random).dissolveValidator(0), 'Dissolved validator', 'Not past the dissolve period');
            });

            it(printTitle('random', 'can dissolve validator after dissolve period ends'), async () => {
                await nodeDeposit(false, false, { value: '4'.ether, from: node });
                await helpers.time.increase(dissolvePeriod + 1);
                await megapool.connect(random).dissolveValidator(0);
            });
        });

        describe('With pre-staked validator', () => {

            before(async () => {
                await deployMegapool({ from: node });
                await nodeDeposit(false, false, { value: '4'.ether, from: node });
            });

        });

        describe('With upgraded delegate', () => {
            let upgradeHelper;
            let oldDelegate, newDelegate;

            before(async () => {
                const rocketStorage = await RocketStorage.deployed();
                upgradeHelper = await MegapoolUpgradeHelper.deployed();
                oldDelegate = await RocketMegapoolDelegate.deployed();
                newDelegate = await RocketMegapoolDelegate.clone(rocketStorage.target);
                await deployMegapool({ from: node });
            });

            it(printTitle('random', 'can not upgrade non-expired delegate'), async () => {
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Try to upgrade
                await shouldRevert(megapool.connect(random).delegateUpgrade(), 'Was able to upgrade delegate', 'Only the node operator can access this method');
            });

            it(printTitle('random', 'can upgrade expired delegate'), async () => {
                const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Fast-forward until delegate expires
                const oldDelegateExpiry = await rocketMegapoolFactory.getDelegateExpiry(oldDelegate.target);
                await helpers.mineUpTo(oldDelegateExpiry + 1n);
                // Try to upgrade
                await megapool.connect(random).delegateUpgrade();
            });

            it(printTitle('node', 'can upgrade non-expired delegate'), async () => {
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Try to upgrade
                await megapool.delegateUpgrade();
            });

            it(printTitle('node', 'can upgrade expired delegate'), async () => {
                const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Fast-forward until delegate expires
                const oldDelegateExpiry = await rocketMegapoolFactory.getDelegateExpiry(oldDelegate.target);
                await helpers.mineUpTo(oldDelegateExpiry + 1n);
                // Try to upgrade
                await megapool.delegateUpgrade();
            });

            it(printTitle('node', 'can not use expired delegate'), async () => {
                const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Fast-forward until delegate expires
                const oldDelegateExpiry = await rocketMegapoolFactory.getDelegateExpiry(oldDelegate.target);
                await helpers.mineUpTo(oldDelegateExpiry + 1n);
                // Try to call a function on the old delegate
                await shouldRevert(megapool.connect(node).getValidatorCount(), 'Used expired delegate', 'Delegate has expired');
            });

            it(printTitle('node', 'can use latest delegate'), async () => {
                const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
                // Enable useLatest
                await megapool.setUseLatestDelegate(true);
                // Execute delegate upgrade via helper contract
                await upgradeHelper.upgradeDelegate(newDelegate.target);
                // Fast-forward until delegate expires
                const oldDelegateExpiry = await rocketMegapoolFactory.getDelegateExpiry(oldDelegate.target);
                await helpers.mineUpTo(oldDelegateExpiry + 1n);
                // Should be able to call a function without reverting
                await megapool.connect(node).getValidatorCount();
                // Effective delegate should be latest
                assert.equal(await megapool.getEffectiveDelegate(), newDelegate.target);
                // Disable use latest and check delegate remains the latest
                await megapool.setUseLatestDelegate(false);
                assert.equal(await megapool.getEffectiveDelegate(), newDelegate.target);
                assert.equal(await megapool.getDelegate(), newDelegate.target);
            });
        });
    });
}
