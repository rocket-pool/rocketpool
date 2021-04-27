import { RocketDAOProtocolSettingsMinipool, RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts';
import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { userDeposit } from '../_helpers/deposit';
import { getMinipoolMinimumRPLStake, createMinipool, stakeMinipool, submitMinipoolWithdrawable, dissolveMinipool } from '../_helpers/minipool';
import { registerNode, setNodeTrusted, setNodeWithdrawalAddress, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { close } from './scenario-close';
import { dissolve } from './scenario-dissolve';
import { refund } from './scenario-refund';
import { stake } from './scenario-stake';
import { withdrawValidatorBalance } from './scenario-withdraw-validator-balance';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';

export default function() {
    contract('RocketMinipool', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            nodeWithdrawalAddress,
            trustedNode,
            dummySwc,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let launchTimeout = 20;
        let withdrawalDelay = 20;
        let initializedMinipool;
        let prelaunchMinipool;
        let prelaunchMinipool2;
        let stakingMinipool;
        let withdrawableMinipool;
        let dissolvedMinipool;
        let withdrawalBalance = web3.utils.toWei('36', 'ether');
        before(async () => {

            // Register node & set withdrawal address
            await registerNode({from: node});
            await setNodeWithdrawalAddress(nodeWithdrawalAddress, {from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, {from: owner});

            // Make user deposit to refund first prelaunch minipool
            let refundAmount = web3.utils.toWei('16', 'ether');
            await userDeposit({from: random, value: refundAmount});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(web3.utils.toBN(6));
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Create minipools
            prelaunchMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            prelaunchMinipool2 = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            stakingMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            withdrawableMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            initializedMinipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            dissolvedMinipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            await stakeMinipool(stakingMinipool, null, {from: node});
            await stakeMinipool(withdrawableMinipool, null, {from: node});
            await submitMinipoolWithdrawable(withdrawableMinipool.address, web3.utils.toWei('32', 'ether'), withdrawalBalance, {from: trustedNode});
            await dissolveMinipool(dissolvedMinipool, {from: node});

            // Check minipool statuses
            let initializedStatus = await initializedMinipool.getStatus.call();
            let prelaunchStatus = await prelaunchMinipool.getStatus.call();
            let prelaunch2Status = await prelaunchMinipool2.getStatus.call();
            let stakingStatus = await stakingMinipool.getStatus.call();
            let withdrawableStatus = await withdrawableMinipool.getStatus.call();
            let dissolvedStatus = await dissolvedMinipool.getStatus.call();
            assert(initializedStatus.eq(web3.utils.toBN(0)), 'Incorrect initialized minipool status');
            assert(prelaunchStatus.eq(web3.utils.toBN(1)), 'Incorrect prelaunch minipool status');
            assert(prelaunch2Status.eq(web3.utils.toBN(1)), 'Incorrect prelaunch minipool status');
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            assert(withdrawableStatus.eq(web3.utils.toBN(3)), 'Incorrect withdrawable minipool status');
            assert(dissolvedStatus.eq(web3.utils.toBN(4)), 'Incorrect dissolved minipool status');

            // Check minipool refund balances
            let prelaunchRefundBalance = await prelaunchMinipool.getNodeRefundBalance.call();
            let prelaunch2RefundBalance = await prelaunchMinipool2.getNodeRefundBalance.call();
            assert(prelaunchRefundBalance.eq(web3.utils.toBN(refundAmount)), 'Incorrect prelaunch minipool refund balance');
            assert(prelaunch2RefundBalance.eq(web3.utils.toBN(0)), 'Incorrect prelaunch minipool refund balance');

        });


        //
        // General
        //

        
        it(printTitle('random address', 'cannot send ETH to non-payable minipool delegate methods'), async () => {

            // Attempt to send ETH to view method
            await shouldRevert(prelaunchMinipool.getStatus({
                from: random,
                value: web3.utils.toWei('1', 'ether'),
            }), 'Sent ETH to a non-payable minipool delegate view method');

            // Attempt to send ETH to mutator method
            await shouldRevert(refund(prelaunchMinipool, {
                from: node,
                value: web3.utils.toWei('1', 'ether'),
            }), 'Sent ETH to a non-payable minipool delegate mutator method');

        });


        it(printTitle('minipool', 'has correct withdrawal credentials'), async () => {

            // Withdrawal credentials settings
            const withdrawalPrefix = '01';
            const padding = '0000000000000000000000';

            // Get minipool withdrawal credentials
            let withdrawalCredentials = await initializedMinipool.getWithdrawalCredentials.call();

            // Check withdrawal credentials
            let expectedWithdrawalCredentials = ('0x' + withdrawalPrefix + padding + initializedMinipool.address.substr(2));
            assert.equal(withdrawalCredentials.toLowerCase(), expectedWithdrawalCredentials.toLowerCase(), 'Invalid minipool withdrawal credentials');

        });


        //
        // Refund
        //


        it(printTitle('node operator', 'can refund a refinanced node deposit balance'), async () => {

            // Refund from minipool with refund balance
            await refund(prelaunchMinipool, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot refund with no refinanced node deposit balance'), async () => {

            // Refund
            await refund(prelaunchMinipool, {from: node});

            // Attempt refund from minipools with no refund balance
            await shouldRevert(refund(prelaunchMinipool, {
                from: node,
            }), 'Refunded from a minipool which was already refunded from');
            await shouldRevert(refund(prelaunchMinipool2, {
                from: node,
            }), 'Refunded from a minipool with no refund balance');

        });


        it(printTitle('random address', 'cannot refund a refinanced node deposit balance'), async () => {

            // Attempt refund from minipool with refund balance
            await shouldRevert(refund(prelaunchMinipool, {
                from: random,
            }), 'Random address refunded from a minipool');

        });


        //
        // Dissolve
        //


        it(printTitle('node operator', 'can dissolve their own minipools'), async () => {

            // Dissolve minipools
            await dissolve(initializedMinipool, {
                from: node,
            });
            await dissolve(prelaunchMinipool, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot dissolve their own staking minipools'), async () => {

            // Attempt to dissolve staking minipool
            await shouldRevert(dissolve(stakingMinipool, {
                from: node,
            }), 'Dissolved a staking minipool');

        });


        it(printTitle('random address', 'can dissolve a timed out minipool at prelaunch'), async () => {

            // Time prelaunch minipool out
            await mineBlocks(web3, launchTimeout);

            // Dissolve prelaunch minipool
            await dissolve(prelaunchMinipool, {
                from: random,
            });

        });


        it(printTitle('random address', 'cannot dissolve a minipool which is not at prelaunch'), async () => {

            // Time prelaunch minipool out
            await mineBlocks(web3, launchTimeout);

            // Attempt to dissolve initialized minipool
            await shouldRevert(dissolve(initializedMinipool, {
                from: random,
            }), 'Random address dissolved a minipool which was not at prelaunch');

        });


        it(printTitle('random address', 'cannot dissolve a minipool which has not timed out'), async () => {

            // Attempt to dissolve prelaunch minipool
            await shouldRevert(dissolve(prelaunchMinipool, {
                from: random,
            }), 'Random address dissolved a minipool which has not timed out');

        });


        //
        // Stake
        //


        it(printTitle('node operator', 'can stake a minipool at prelaunch'), async () => {

            // Stake prelaunch minipool
            await stake(prelaunchMinipool, getValidatorPubkey(), null, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot stake a minipool which is not at prelaunch'), async () => {

            // Attempt to stake initialized minipool
            await shouldRevert(stake(initializedMinipool, getValidatorPubkey(), null, {
                from: node,
            }), 'Staked a minipool which was not at prelaunch');

        });


        it(printTitle('node operator', 'cannot stake a minipool with a reused validator pubkey'), async () => {

            // Get pubkey
            let pubkey = getValidatorPubkey();

            // Stake prelaunch minipool
            await stake(prelaunchMinipool, pubkey, null, {from: node});

            // Attempt to stake second prelaunch minipool with same pubkey
            await shouldRevert(stake(prelaunchMinipool2, pubkey, null, {
                from: node,
            }), 'Staked a minipool with a reused validator pubkey');

        });


        it(printTitle('node operator', 'cannot stake a minipool with incorrect withdrawal credentials'), async () => {

            // Get withdrawal credentials
            let invalidWithdrawalCredentials = '0x1111111111111111111111111111111111111111111111111111111111111111';

            // Attempt to stake prelaunch minipool
            await shouldRevert(stake(prelaunchMinipool, getValidatorPubkey(), invalidWithdrawalCredentials, {
                from: node,
            }), 'Staked a minipool with incorrect withdrawal credentials');

        });


        it(printTitle('random address', 'cannot stake a minipool'), async () => {

            // Attempt to stake prelaunch minipool
            await shouldRevert(stake(prelaunchMinipool, getValidatorPubkey(), null, {
                from: random,
            }), 'Random address staked a minipool');

        });

  
 
        //
        // Withdraw validator balance
        //
        

        
        it(printTitle('node operator', 'cannot send withdraw balance to a minipool which is not withdrawable'), async () => {

            // Attempt to send validator balance
            await shouldRevert(withdrawValidatorBalance(stakingMinipool, true, {
                from: node,
                value: withdrawalBalance,
            }), 'Withdrew validator balance to a minipool which was not withdrawable', "The minipool's validator balance can only be sent while withdrawable");

        });


        it(printTitle('node', 'cannot run payout method while processing withdrawals is disabled'), async () => {

            // Disable processing withdrawals
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.process.withdrawals.enabled', false, {from: owner});

            // Attempt to send validator balance
            await shouldRevert(withdrawValidatorBalance(withdrawableMinipool, true, {
                from: nodeWithdrawalAddress,
                value: withdrawalBalance,
            }), 'Payout method was run while withdrawals was disabled', "Processing withdrawals is currently disabled");

        });


        it(printTitle('random', 'random address cannot withdraw a node operators minipool balance'), async () => {

            // Attempt to send validator balance
            await shouldRevert(withdrawValidatorBalance(withdrawableMinipool, true, {
                from: random,
                value: withdrawalBalance,
            }), 'Random address withdrew validator balance from a node operators minipool', "The payout function must be called by the current node operators withdrawal address");

        });

        it(printTitle('node operator', 'cannot withdraw their ETH once it is received if they do not confirm they wish to do so'), async () => {

            // Send validator balance and withdraw
            await shouldRevert(withdrawValidatorBalance(withdrawableMinipool, false, {
                from: nodeWithdrawalAddress,
                value: withdrawalBalance,
            }), 'Random address withdrew validator balance from a node operators minipool', "Node operator did not confirm they wish to payout now");

        });


        it(printTitle('node operator withdrawal address', 'can withdraw their ETH once it is received, then distribute ETH to the rETH contract / deposit pool and destroy the minipool'), async () => {

            // Send validator balance and withdraw
            await withdrawValidatorBalance(withdrawableMinipool, true, {
                from: nodeWithdrawalAddress,
                value: withdrawalBalance,
            });

        });

        it(printTitle('node operator account', 'can also withdraw their ETH once it is received, then distribute ETH to the rETH contract / deposit pool and destroy the minipool'), async () => {

            // Send validator balance and withdraw
            await withdrawValidatorBalance(withdrawableMinipool, true, {
                from: node,
                value: withdrawalBalance,
            });

        });
        
        
        it(printTitle('random address', 'can send validator balance to a withdrawable minipool in one transaction'), async () => {

            await web3.eth.sendTransaction({
                from: random,
                to: withdrawableMinipool.address,
                value: withdrawalBalance,
            });

            // Process validator balance
            await withdrawValidatorBalance(withdrawableMinipool, true, {
                from: nodeWithdrawalAddress,
                value: 0,
            });

        });

        
        it(printTitle('random address', 'can send validator balance to a withdrawable minipool across multiple transactions'), async () => {

            // Get tx amount (half of withdrawal balance)
            let amount = web3.utils.toBN(withdrawalBalance).div(web3.utils.toBN(2));

            await web3.eth.sendTransaction({
                from: random,
                to: withdrawableMinipool.address,
                value: amount,
            });

            await web3.eth.sendTransaction({
                from: owner,
                to: withdrawableMinipool.address,
                value: amount,
            });

            // Process payout
            await withdrawValidatorBalance(withdrawableMinipool, true, {
                from: nodeWithdrawalAddress,
                value: 0,
            }, false);


        });
        
        

        //
        // Close
        //

        
        it(printTitle('node operator', 'can close a dissolved minipool'), async () => {

            // Close dissolved minipool
            await close(dissolvedMinipool, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot close a minipool which is not dissolved'), async () => {

            // Attempt to close staking minipool
            await shouldRevert(close(stakingMinipool, {
                from: node,
            }), 'Closed a minipool which was not dissolved');

        });


        it(printTitle('random address', 'cannot close a dissolved minipool'), async () => {

            // Attempt to close dissolved minipool
            await shouldRevert(close(dissolvedMinipool, {
                from: random,
            }), 'Random address closed a minipool');

        });
        
        

    });
}
