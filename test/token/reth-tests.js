import { mineBlocks } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { getDepositExcessBalance, userDeposit } from '../_helpers/deposit';
import { getMinipoolMinimumRPLStake, getMinipoolWithdrawalUserBalance, createMinipool, stakeMinipool, submitMinipoolWithdrawable, payoutMinipool } from '../_helpers/minipool';
import { submitBalances } from '../_helpers/network';
import { registerNode, setNodeTrusted, nodeStakeRPL, setNodeWithdrawalAddress } from '../_helpers/node';
import { getRethBalance, getRethExchangeRate, getRethTotalSupply, mintRPL } from '../_helpers/tokens';
import { burnReth } from './scenario-reth-burn';
import { transferReth } from './scenario-reth-transfer'
import { RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';

export default function() {
    contract('RocketTokenRETH', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            nodeWithdrawalAddress,
            trustedNode,
            staker1,
            staker2,
            random,
        ] = accounts;


        // Setup
        let minipool;
        let validatorPubkey = getValidatorPubkey();
        let withdrawalBalance = web3.utils.toWei('36', 'ether');
        let rethBalance;
        let submitPricesFrequency = 500;
        let depositDeplay = 100;
        before(async () => {

            // Get current rETH exchange rate
            let exchangeRate1 = await getRethExchangeRate();

            // Make deposit
            await userDeposit({from: staker1, value: web3.utils.toWei('16', 'ether')});

            // Register node & set withdrawal address
            await registerNode({from: node});
            await setNodeWithdrawalAddress(node, nodeWithdrawalAddress, {from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.reth.collateral.target', web3.utils.toWei('1', 'ether'), {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.frequency', submitPricesFrequency, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.reth.deposit.delay', depositDeplay, {from: owner});


            // Stake RPL to cover minipools
            let rplStake = await getMinipoolMinimumRPLStake();
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Create withdrawable minipool
            minipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            await stakeMinipool(minipool, validatorPubkey, {from: node});
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), withdrawalBalance, {from: trustedNode});

            // Update network ETH total to alter rETH exchange rate
            let minipoolUserBalance = await getMinipoolWithdrawalUserBalance(minipool.address);
            let rethSupply = await getRethTotalSupply();
            await submitBalances(1, minipoolUserBalance, 0, rethSupply, {from: trustedNode});

            // Get & check staker rETH balance
            rethBalance = await getRethBalance(staker1);
            assert(rethBalance.gt(web3.utils.toBN(0)), 'Incorrect staker rETH balance');

            // Get & check updated rETH exchange rate
            let exchangeRate2 = await getRethExchangeRate();
            assert(!exchangeRate1.eq(exchangeRate2), 'rETH exchange rate has not changed');

        });


        it(printTitle('rETH holder', 'cannot burn rETH before enough time has passed'), async () => {

            // Make user deposit
            const depositAmount = web3.utils.toBN(web3.utils.toWei('20', 'ether'));
            await userDeposit({from: staker2, value: depositAmount});

            // Check deposit pool excess balance
            let excessBalance = await getDepositExcessBalance();
            assert(web3.utils.toBN(excessBalance).eq(depositAmount), 'Incorrect deposit pool excess balance');

            // Burn rETH
            await shouldRevert(burnReth(rethBalance, {
                from: staker1,
            }), 'Burn should have failed before enough time has passed');

        });


        it(printTitle('rETH holder', 'cannot transfer rETH before enough time has passed'), async () => {

            // Make user deposit
            const depositAmount = web3.utils.toBN(web3.utils.toWei('20', 'ether'));
            await userDeposit({from: staker2, value: depositAmount});

            // Transfer rETH
            await shouldRevert(transferReth(random, rethBalance, {
                from: staker1,
            }), 'Transfer should have failed before enough time has passed');

        });


        it(printTitle('rETH holder', 'can transfer rETH after enough time has passed'), async () => {

            // Make user deposit
            const depositAmount = web3.utils.toBN(web3.utils.toWei('20', 'ether'));
            await userDeposit({from: staker2, value: depositAmount});

            // Wait "network.reth.deposit.delay" blocks
            await mineBlocks(web3, depositDeplay);

            // Transfer rETH
            await transferReth(random, rethBalance, {
                from: staker1,
            });

        });


        it(printTitle('rETH holder', 'can transfer rETH without waiting if received via transfer'), async () => {

            // Make user deposit
            const depositAmount = web3.utils.toBN(web3.utils.toWei('20', 'ether'));
            await userDeposit({from: staker2, value: depositAmount});

            // Wait "network.reth.deposit.delay" blocks
            await mineBlocks(web3, depositDeplay);

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

            // Wait "network.reth.deposit.delay" blocks
            await mineBlocks(web3, depositDeplay);

            // Send ETH to the minipool to simulate receving from SWC
            await web3.eth.sendTransaction({
                from: trustedNode,
                to: minipool.address,
                value: withdrawalBalance
            });

            // Run the payout function now
            await payoutMinipool(minipool, true, {
                from: node
            });

            // Burn rETH
            await burnReth(rethBalance, {
                from: staker1,
            });

        });

        
        it(printTitle('rETH holder', 'can burn rETH for excess deposit pool ETH'), async () => {

            // Make user deposit
            const depositAmount = web3.utils.toBN(web3.utils.toWei('20', 'ether'));
            await userDeposit({from: staker2, value: depositAmount});

            // Check deposit pool excess balance
            let excessBalance = await getDepositExcessBalance();
            assert(web3.utils.toBN(excessBalance).eq(depositAmount), 'Incorrect deposit pool excess balance');

            // Wait "network.reth.deposit.delay" blocks
            await mineBlocks(web3, depositDeplay);

            // Burn rETH
            await burnReth(rethBalance, {
                from: staker1,
            });

        });


        it(printTitle('rETH holder', 'cannot burn an invalid amount of rETH'), async () => {

            // Wait "network.reth.deposit.delay" blocks
            await mineBlocks(web3, depositDeplay);

            // Send ETH to the minipool to simulate receving from SWC
            await web3.eth.sendTransaction({
                from: trustedNode,
                to: minipool.address,
                value: withdrawalBalance
            });

            // Run the payout function now
            await payoutMinipool(minipool, true, {
                from: node
            });

            // Get burn amounts
            let burnZero = web3.utils.toWei('0', 'ether');
            let burnExcess = web3.utils.toBN(web3.utils.toWei('100', 'ether'));
            assert(burnExcess.gt(rethBalance), 'Burn amount does not exceed rETH balance');

            // Attempt to burn 0 rETH
            await shouldRevert(burnReth(burnZero, {
                from: staker1,
            }), 'Burned an invalid amount of rETH');

            // Attempt to burn too much rETH
            await shouldRevert(burnReth(burnExcess, {
                from: staker1,
            }), 'Burned an amount of rETH greater than the token balance');

        });


        it(printTitle('rETH holder', 'cannot burn rETH with insufficient collateral'), async () => {

            // Wait "network.reth.deposit.delay" blocks
            await mineBlocks(web3, depositDeplay);

            // Attempt to burn rETH for contract collateral
            await shouldRevert(burnReth(rethBalance, {
                from: staker1,
            }), 'Burned rETH with an insufficient contract ETH balance');

            // Make user deposit
            const depositAmount = web3.utils.toBN(web3.utils.toWei('10', 'ether'));
            await userDeposit({from: staker2, value: depositAmount});

            // Check deposit pool excess balance
            let excessBalance = await getDepositExcessBalance();
            assert(web3.utils.toBN(excessBalance).eq(depositAmount), 'Incorrect deposit pool excess balance');

            // Attempt to burn rETH for excess deposit pool ETH
            await shouldRevert(burnReth(rethBalance, {
                from: staker1,
            }), 'Burned rETH with an insufficient deposit pool excess ETH balance');

        });
        

    });
}
