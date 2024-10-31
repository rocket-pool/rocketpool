import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getDepositExcessBalance, userDeposit } from '../_helpers/deposit';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { depositExcessCollateral, getRethBalance, getRethCollateralRate } from '../_helpers/tokens';
import { burnReth } from './scenario-reth-burn';
import { transferReth } from './scenario-reth-transfer';
import {
    RocketDAOProtocolSettingsDeposit,
    RocketDAOProtocolSettingsNetwork,
    RocketTokenRETH,
} from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { assertBN } from '../_helpers/bn';
import { globalSnapShot } from '../_utils/snapshotting';
import { getMegapoolForNode, nodeDeposit } from '../_helpers/megapool';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketTokenRETH', () => {
        let owner,
            node,
            trustedNode,
            staker1,
            staker2,
            random;

        // Setup
        const submitPricesFrequency = 500;
        const depositFeePerc = '0.005'.ether; // 0.5% deposit fee
        const rethCollateralRate = '1'.ether;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                trustedNode,
                staker1,
                staker2,
                random,
            ] = await ethers.getSigners();

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.reth.collateral.target', rethCollateralRate, { from: owner });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.frequency', submitPricesFrequency, { from: owner });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.fee', depositFeePerc, { from: owner });
        });

        it(printTitle('rETH holder', 'can transfer rETH after deposit'), async () => {
            // Make user deposit
            const depositAmount = '20'.ether;
            await userDeposit({ from: staker2, value: depositAmount });
            const rethBalance = await getRethBalance(staker1.address);
            // Transfer rETH
            await transferReth(random, rethBalance, {
                from: staker1,
            });
        });

        it(printTitle('rETH holder', 'can transfer rETH if received via transfer'), async () => {
            // Make user deposit
            const depositAmount = '20'.ether;
            await userDeposit({ from: staker2, value: depositAmount });
            const rethBalance = await getRethBalance(staker1.address);
            // Transfer rETH
            await transferReth(random, rethBalance, {
                from: staker1,
            });
            // Transfer rETH again
            await transferReth(staker1, rethBalance, {
                from: random,
            });
        });

        it(printTitle('rETH holder', 'can burn rETH for ETH collateral'), async () => {
            // Make user deposit
            const depositAmount = '20'.ether;
            await userDeposit({ from: staker1, value: depositAmount });
            const rethBalance = await getRethBalance(staker1.address);
            // Burn rETH
            await burnReth(rethBalance, {
                from: staker1,
            });
        });

        it(printTitle('rETH holder', 'cannot burn an invalid amount of rETH'), async () => {
            // Make user deposit
            const depositAmount = '20'.ether;
            await userDeposit({ from: staker1, value: depositAmount });
            const rethBalance = await getRethBalance(staker1.address);
            // Get burn amounts
            let burnZero = '0'.ether;
            let burnExcess = '100'.ether;
            assertBN.isAbove(burnExcess, rethBalance, 'Burn amount does not exceed rETH balance');
            // Attempt to burn 0 rETH
            await shouldRevert(burnReth(burnZero, {
                from: staker1,
            }), 'Burned an invalid amount of rETH');
            // Attempt to burn too much rETH
            await shouldRevert(burnReth(burnExcess, {
                from: staker1,
            }), 'Burned an amount of rETH greater than the token balance');
        });

        it(printTitle('random', 'can deposit excess collateral into the deposit pool'), async () => {
            // Send enough ETH to rETH contract to exceed target collateralisation rate
            const rocketTokenRETH = await RocketTokenRETH.deployed();
            await random.sendTransaction({
                to: rocketTokenRETH.target,
                value: '32'.ether,
            });
            // Call the deposit excess function
            await depositExcessCollateral({ from: random });
            // Collateral should now be at the target rate
            const collateralRate = await getRethCollateralRate();
            // Collateral rate should now be 1 (the target rate)
            assertBN.equal(collateralRate, '1'.ether);
        });

        describe('With node deposit', () => {
            let rethBalance;

            const depositAmount = '28'.ether;

            before(async () => {
                // Make a user deposit enough to create a 4 ETH bonded validator
                await userDeposit({ from: staker1, value: depositAmount });
                rethBalance = await getRethBalance(staker1.address);
                // Register trusted node
                await registerNode({ from: trustedNode });
                await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);
                // Register node and create a validator
                await registerNode({ from: node });
                await nodeDeposit(false, false, { value: '4'.ether, from: node });
                await getMegapoolForNode(node);
            });

            it(printTitle('rETH holder', 'can burn rETH for excess deposit pool ETH'), async () => {
                // Make a user deposit from another stake large enough to burn staker1's rETH balance
                await userDeposit({ from: staker2, value: depositAmount });
                // Check deposit pool excess balance
                let excessBalance = await getDepositExcessBalance();
                assertBN.equal(excessBalance, depositAmount, 'Incorrect deposit pool excess balance');
                // Burn rETH
                await burnReth(rethBalance, {
                    from: staker1,
                });
            });

            it(printTitle('rETH holder', 'cannot burn rETH with insufficient collateral'), async () => {
                // Attempt to burn rETH for contract collateral
                await shouldRevert(burnReth(rethBalance, {
                    from: staker1,
                }), 'Burned rETH with an insufficient contract ETH balance');
                // Make user deposit
                const depositAmount = '10'.ether;
                await userDeposit({ from: staker2, value: depositAmount });
                // Check deposit pool excess balance
                let excessBalance = await getDepositExcessBalance();
                assertBN.equal(excessBalance, depositAmount, 'Incorrect deposit pool excess balance');
                // Attempt to burn rETH for excess deposit pool ETH
                await shouldRevert(burnReth(rethBalance, {
                    from: staker1,
                }), 'Burned rETH with an insufficient deposit pool excess ETH balance');
            });
        });

        // TODO: Add tests for burning rETH and receiving validator rewards once megapool distributes are implemented
    });
}
