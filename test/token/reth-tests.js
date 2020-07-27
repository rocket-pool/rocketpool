import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { userDeposit } from '../_helpers/deposit';
import { getMinipoolWithdrawalUserBalance, createMinipool, stakeMinipool, submitMinipoolWithdrawable } from '../_helpers/minipool';
import { submitETHBalances, depositValidatorWithdrawal, processValidatorWithdrawal } from '../_helpers/network';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { setNetworkSetting } from '../_helpers/settings';
import { getRethBalance, getRethExchangeRate, getRethTotalSupply } from '../_helpers/tokens';
import { burnReth } from './scenario-burn-reth';

export default function() {
    contract('RocketETHToken', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
            staker,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let validatorPubkey = getValidatorPubkey();
        let withdrawalBalance = web3.utils.toWei('36', 'ether');
        let rethBalance;
        before(async () => {

            // Get current rETH exchange rate
            let exchangeRate1 = await getRethExchangeRate();

            // Make deposit
            await userDeposit({from: staker, value: web3.utils.toWei('16', 'ether')});

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

            // Set settings
            await setNetworkSetting('TargetRethCollateralRate', web3.utils.toWei('1', 'ether'), {from: owner});

            // Create withdrawable minipool
            let minipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            await stakeMinipool(minipool, validatorPubkey, {from: node});
            await submitMinipoolWithdrawable(minipool.address, withdrawalBalance, 0, 1, 0, {from: trustedNode});

            // Update network ETH total to alter rETH exchange rate
            let minipoolUserBalance = await getMinipoolWithdrawalUserBalance(minipool.address);
            let rethSupply = await getRethTotalSupply();
            await submitETHBalances(1, minipoolUserBalance, 0, rethSupply, {from: trustedNode});

            // Get & check staker rETH balance
            rethBalance = await getRethBalance(staker);
            assert(rethBalance.gt(web3.utils.toBN(0)), 'Incorrect staker rETH balance');

            // Get & check updated rETH exchange rate
            let exchangeRate2 = await getRethExchangeRate();
            assert(!exchangeRate1.eq(exchangeRate2), 'rETH exchange rate has not changed');

        });


        it(printTitle('rETH holder', 'can burn rETH for ETH'), async () => {

            // Withdraw minipool validator balance to rETH contract
            await depositValidatorWithdrawal({from: owner, value: withdrawalBalance});
            await processValidatorWithdrawal(validatorPubkey, {from: trustedNode});

            // Burn rETH
            await burnReth(rethBalance, {
                from: staker,
            });

        });


        it(printTitle('rETH holder', 'cannot burn an invalid amount of rETH'), async () => {

            // Withdraw minipool validator balance to rETH contract
            await depositValidatorWithdrawal({from: owner, value: withdrawalBalance});
            await processValidatorWithdrawal(validatorPubkey, {from: trustedNode});

            // Get burn amounts
            let burnZero = web3.utils.toWei('0', 'ether');
            let burnExcess = web3.utils.toBN(web3.utils.toWei('100', 'ether'));
            assert(burnExcess.gt(rethBalance), 'Burn amount does not exceed rETH balance');

            // Attempt to burn 0 rETH
            await shouldRevert(burnReth(burnZero, {
                from: staker,
            }), 'Burned an invalid amount of rETH');

            // Attempt to burn too much rETH
            await shouldRevert(burnReth(burnExcess, {
                from: staker,
            }), 'Burned an amount of rETH greater than the token balance');

        });


        it(printTitle('rETH holder', 'cannot burn rETH with an insufficient contract ETH balance'), async () => {

            // Attempt to burn rETH
            await shouldRevert(burnReth(rethBalance, {
                from: staker,
            }), 'Burned rETH with an insufficient contract ETH balance');

        });


    });
}
