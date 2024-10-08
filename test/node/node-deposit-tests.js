import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNode,
    RocketMinipoolBondReducer,
    RocketMinipoolDelegate,
} from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { getMinipoolMinimumRPLStake, stakeMinipool } from '../_helpers/minipool';
import { getNodeFee } from '../_helpers/network';
import { nodeDepositEthFor, nodeStakeRPL, registerNode, setNodeTrusted } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { depositV2 } from './scenario-deposit-v2';
import { reduceBond } from '../minipool/scenario-reduce-bond';
import { userDeposit } from '../_helpers/deposit';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { assertBN } from '../_helpers/bn';
import { globalSnapShot } from '../_utils/snapshotting';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNodeDeposit', () => {
        let owner,
            node,
            trustedNode,
            random;

        const launchTimeout = (60 * 60 * 72); // 72 hours
        const bondReductionWindowStart = (2 * 24 * 60 * 60);
        const bondReductionWindowLength = (2 * 24 * 60 * 60);
        const noMinimumNodeFee = '0'.ether;

        let lebDepositNodeAmount;
        let halfDepositNodeAmount;
        let minipoolRplStake;

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                trustedNode,
                random,
            ] = await ethers.getSigners();

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, { from: owner });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.start', bondReductionWindowStart, { from: owner });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.length', bondReductionWindowLength, { from: owner });

            // Register node
            await registerNode({ from: node });

            // Register trusted node
            await registerNode({ from: trustedNode });
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Get settings
            lebDepositNodeAmount = '8'.ether;
            halfDepositNodeAmount = '16'.ether;

            minipoolRplStake = await getMinipoolMinimumRPLStake();
        });

        it(printTitle('node operator', 'cannot make a deposit with insufficient RPL staked'), async () => {
            // Attempt deposit with no RPL staked
            await shouldRevert(depositV2(noMinimumNodeFee, lebDepositNodeAmount, {
                from: node,
                value: lebDepositNodeAmount,
            }), 'Made a deposit with insufficient RPL staked');

            // Stake insufficient RPL amount
            let rplStake = minipoolRplStake / 2n;
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, { from: node });

            // Attempt deposit with insufficient RPL staked
            await shouldRevert(depositV2(noMinimumNodeFee, lebDepositNodeAmount, {
                from: node,
                value: lebDepositNodeAmount,
            }), 'Made a deposit with insufficient RPL staked');
        });

        it(printTitle('random address', 'cannot make a deposit'), async () => {
            // Attempt deposit
            await shouldRevert(depositV2(noMinimumNodeFee, lebDepositNodeAmount, {
                from: random,
                value: lebDepositNodeAmount,
            }), 'Random address made a deposit');

            // Attempt deposit
            await shouldRevert(depositV2(noMinimumNodeFee, halfDepositNodeAmount, {
                from: random,
                value: halfDepositNodeAmount,
            }), 'Random address made a deposit');
        });

        describe('With 1x Minipool RPL Staked', () => {
            before(async () => {
                // Stake RPL to cover minipool
                let rplStake = await getMinipoolMinimumRPLStake();
                await mintRPL(owner, node, rplStake);
                await nodeStakeRPL(rplStake, { from: node });
            });

            it(printTitle('node operator', 'cannot make a deposit while deposits are disabled'), async () => {
                // Disable deposits
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.deposit.enabled', false, { from: owner });

                // Attempt deposit
                await shouldRevert(depositV2(noMinimumNodeFee, lebDepositNodeAmount, {
                    from: node,
                    value: lebDepositNodeAmount,
                }), 'Made a deposit while deposits were disabled');

                // Attempt deposit
                await shouldRevert(depositV2(noMinimumNodeFee, halfDepositNodeAmount, {
                    from: node,
                    value: halfDepositNodeAmount,
                }), 'Made a deposit while deposits were disabled');
            });

            it(printTitle('node operator', 'cannot make a deposit with a minimum node fee exceeding the current network node fee'), async () => {
                // Settings
                let nodeFee = await getNodeFee();
                let minimumNodeFee = nodeFee + '0.01'.ether;

                // Attempt deposit
                await shouldRevert(depositV2(minimumNodeFee, lebDepositNodeAmount, {
                    from: node,
                    value: lebDepositNodeAmount,
                }), 'Made a deposit with a minimum node fee exceeding the current network node fee');

                // Attempt deposit
                await shouldRevert(depositV2(minimumNodeFee, halfDepositNodeAmount, {
                    from: node,
                    value: halfDepositNodeAmount,
                }), 'Made a deposit with a minimum node fee exceeding the current network node fee');
            });

            it(printTitle('node operator', 'cannot make a deposit with an invalid amount'), async () => {
                // Get deposit amount
                let depositAmount = '10'.ether;
                assertBN.notEqual(depositAmount, lebDepositNodeAmount, 'Deposit amount is not invalid');
                assertBN.notEqual(depositAmount, halfDepositNodeAmount, 'Deposit amount is not invalid');

                // Attempt deposit
                await shouldRevert(depositV2(noMinimumNodeFee, depositAmount, {
                    from: node,
                    value: depositAmount,
                }), 'Made a deposit with an invalid deposit amount');
            });
        });

        describe('With 3x Minipool RPL Staked', () => {
            before(async () => {
                // Stake RPL to cover minipools
                let rplStake = minipoolRplStake * 3n;
                await mintRPL(owner, node, rplStake);
                await nodeStakeRPL(rplStake, { from: node });
            });

            it(printTitle('node operator', 'can make a deposit to create a minipool'), async () => {
                // Deposit
                await depositV2(noMinimumNodeFee, lebDepositNodeAmount, {
                    from: node,
                    value: lebDepositNodeAmount,
                });
            });

            it(printTitle('node operator', 'can make a deposit to create a minipool using deposit credit'), async () => {
                // Create a 16 ETH minipool
                await userDeposit({ from: random, value: '24'.ether });
                const minipoolAddress = await depositV2(noMinimumNodeFee, halfDepositNodeAmount, {
                    from: node,
                    value: halfDepositNodeAmount,
                });
                const minipool = await RocketMinipoolDelegate.at(minipoolAddress);

                // Stake the minipool
                await helpers.time.increase(launchTimeout + 1);
                await stakeMinipool(minipool, { from: node });

                // Signal wanting to reduce and wait 7 days
                const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
                await rocketMinipoolBondReducer.connect(node).beginReduceBondAmount(minipool.target, '8'.ether);
                await helpers.time.increase(bondReductionWindowStart + 1);

                // Reduce the bond to 8 ether to receive a deposit credit
                await reduceBond(minipool, { from: node });

                // Create an 8 ether minipool (using 8 ether from credit)
                await depositV2(noMinimumNodeFee, lebDepositNodeAmount, {
                    from: node,
                    value: 0n,
                });
            });

            it(printTitle('node operator', 'can make a deposit to create a minipool using deposit credit and deposit balance'), async () => {
                // Create a 16 ETH minipool
                await userDeposit({ from: random, value: '24'.ether });
                const minipoolAddress = await depositV2(noMinimumNodeFee, halfDepositNodeAmount, {
                    from: node,
                    value: halfDepositNodeAmount,
                });
                const minipool = await RocketMinipoolDelegate.at(minipoolAddress);

                // Stake the minipool
                await helpers.time.increase(launchTimeout + 1);
                await stakeMinipool(minipool, { from: node });

                // Signal wanting to reduce and wait 7 days
                const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
                await rocketMinipoolBondReducer.connect(node).beginReduceBondAmount(minipool.target, '8'.ether);
                await helpers.time.increase(bondReductionWindowStart + 1);

                // Reduce the bond to 8 ether to receive a deposit credit
                await reduceBond(minipool, { from: node });

                // Deposit ETH to the node operator
                await nodeDepositEthFor(node, { from: owner, value: '8'.ether });

                // Create an 16 ether minipool (using 8 ether from credit and 8 ether from balance)
                await depositV2(noMinimumNodeFee, halfDepositNodeAmount, {
                    from: node,
                    value: 0n,
                });
            });

            it(printTitle('node operator', 'can make a deposit to create a minipool using deposit credit, deposit balance and supplying shortfall'), async () => {
                // Create a 16 ETH minipool
                await userDeposit({ from: random, value: '24'.ether });
                const minipoolAddress = await depositV2(noMinimumNodeFee, halfDepositNodeAmount, {
                    from: node,
                    value: halfDepositNodeAmount,
                });
                const minipool = await RocketMinipoolDelegate.at(minipoolAddress);

                // Stake the minipool
                await helpers.time.increase(launchTimeout + 1);
                await stakeMinipool(minipool, { from: node });

                // Signal wanting to reduce and wait 7 days
                const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
                await rocketMinipoolBondReducer.connect(node).beginReduceBondAmount(minipool.target, '8'.ether);
                await helpers.time.increase(bondReductionWindowStart + 1);

                // Reduce the bond to 8 ether to receive a deposit credit
                await reduceBond(minipool, { from: node });

                // Deposit ETH to the node operator
                await nodeDepositEthFor(node, { from: owner, value: '4'.ether });

                // Create a 16 ether minipool (using 8 ether from credit,  4 ether from balance and 4 ether in msg.value)
                await depositV2(noMinimumNodeFee, halfDepositNodeAmount, {
                    from: node,
                    value: '4'.ether,
                });
            });

            it(printTitle('node operator', 'can deposit ETH then use it to create a minipool'), async () => {
                // Perform a user deposit into DP
                await userDeposit({ from: random, value: '24'.ether });

                // Deposit ETH to the node operator
                await nodeDepositEthFor(node, { from: owner, value: '8'.ether });

                // Create a minipool with the ETH balance
                await depositV2(noMinimumNodeFee, lebDepositNodeAmount, {
                    from: node,
                    value: 0n,
                });
            });

            it(printTitle('node operator', 'can deposit ETH then use it to create a minipool while supplying the shortfall'), async () => {
                // Perform a user deposit into DP
                await userDeposit({ from: random, value: '24'.ether });

                // Deposit ETH to the node operator
                await nodeDepositEthFor(node, { from: owner, value: '4'.ether });

                // Create a minipool with the ETH balance
                await depositV2(noMinimumNodeFee, lebDepositNodeAmount, {
                    from: node,
                    value: '4'.ether,
                });
            });

            it(printTitle('node operator', 'can not create a minipool with insufficient credit'), async () => {
                // Perform a user deposit into DP
                await userDeposit({ from: random, value: '24'.ether });

                // Create a minipool with the ETH balance
                await shouldRevert(depositV2(noMinimumNodeFee, lebDepositNodeAmount, {
                    from: node,
                    value: 0n,
                }), 'Was able to create a minipool with insufficient credit', 'Insufficient credit');
            });
        });
    });
}
