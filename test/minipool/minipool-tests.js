import {
  RocketDAOProtocolSettingsMinipool,
  RocketDAOProtocolSettingsNetwork,
  RocketDAOProtocolSettingsDeposit,
  RocketMinipoolManager,
  RevertOnTransfer,
  RocketTokenRETH, RocketAuctionManager, RocketVault, RocketTokenRPL
} from '../_utils/artifacts'
import { increaseTime, mineBlocks } from '../_utils/evm'
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
import { getNodeFee } from '../_helpers/network'
import { getNetworkSetting } from '../_helpers/settings'

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
            await setNodeWithdrawalAddress(node, nodeWithdrawalAddress, {from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, {from: owner});

            // Set rETH collateralisation target to a value high enough it won't cause excess ETH to be funneled back into deposit pool and mess with our calcs
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.reth.collateral.target', web3.utils.toWei('50', 'ether'), {from: owner});

            // Make user deposit to refund first prelaunch minipool
            let refundAmount = web3.utils.toWei('16', 'ether');
            await userDeposit({from: random, value: refundAmount});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(web3.utils.toBN(7));
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
            await submitMinipoolWithdrawable(withdrawableMinipool.address, {from: trustedNode});
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


        it(printTitle('node operator', 'cannot create/destroy minipool without price consensus'), async () => {
            const priceFrequency = 50;
            // Set price frequency to a low value so we can mine fewer blocks
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.frequency', priceFrequency, {from: owner});
            // Mine blocks until next price window
            await mineBlocks(web3, priceFrequency);
            // Creating minipool should fail now because oracles have not submitted price for this window
            await shouldRevert(createMinipool({from: node, value: web3.utils.toWei('32', 'ether')}), 'Was able to create a minipool when network was not in consensus about price', 'Cannot create a minipool while network is reaching consensus');
            // Closing a minipool should fail too
            await shouldRevert(close(dissolvedMinipool, { from: node, }), 'Was able to destroy a minipool when network was not in consensus about price', 'Cannot destroy a minipool while network is reaching consensus');
        });


        it(printTitle('node operator', 'cannot create a minipool if network capacity is reached and destroying a minipool reduces the capacity'), async () => {
          // Retrieve the current number of minipools
          const rocketMinipoolManager = await RocketMinipoolManager.deployed();
          const minipoolCount = (await rocketMinipoolManager.getMinipoolCount()).toNumber();
          // Set max to the current number
          await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.maximum.count', minipoolCount, {from: owner});
          // Creating minipool should fail now
          await shouldRevert(createMinipool({from: node, value: web3.utils.toWei('32', 'ether')}), 'Was able to create a minipool when capacity is reached', 'Global minipool limit reached');
          // Destroy a pool
          await withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, nodeWithdrawalAddress, true);
          // Creating minipool should no longer fail
          await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
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
        // Destroy
        //


        it(printTitle('node operator', 'can destroy a withdrawn minipool'), async () => {

          // Wait 14 days
          await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
          // Withdraw without destroying
          await withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, random, false);

          // Destroy
          await withdrawableMinipool.destroy({ from: nodeWithdrawalAddress });

          // Minipool contract should be dead
          let code = await web3.eth.getCode(withdrawableMinipool.address);
          assert(code === '0x', 'Minipool contract was not destroyed')

        });


        it(printTitle('node operator', 'cannot destroy a non-withdrawn minipool'), async () => {

          // Destroy
          await shouldRevert(withdrawableMinipool.destroy({ from: nodeWithdrawalAddress }), 'Minipool was destroyed before withdrawn', 'Minipool must have been withdrawn before destroying');

        });


        it(printTitle('random address', 'cannot destroy a withdrawn minipool'), async () => {

          // Wait 14 days
          await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
          // Withdraw without destroying
          await withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, random, false);

          // Destroy
          await shouldRevert(withdrawableMinipool.destroy({ from: random }), 'Minipool was destroyed by random', 'Only node operator can destroy minipool');
        });


        //
        // Slash
        //


        it(printTitle('random address', 'can slash node operator if withdrawal balance is less than 16 ETH'), async () => {

          // Stake the prelaunch minipool (it has 16 ETH user funds)
          await stakeMinipool(prelaunchMinipool, null, {from: node});
          // Mark it as withdrawable
          await submitMinipoolWithdrawable(prelaunchMinipool.address, {from: trustedNode});
          // Post an 8 ETH balance which should result in 8 ETH worth of RPL slashing
          await withdrawValidatorBalance(prelaunchMinipool, web3.utils.toWei('8', 'ether'), nodeWithdrawalAddress, false);
          // Call slash method
          await prelaunchMinipool.slash({ from: random });

          // Auction house should now have slashed 8 ETH worth of RPL (which is 800 RPL at starting price)
          const rocketVault = await RocketVault.deployed();
          const rocketTokenRPL = await RocketTokenRPL.deployed();
          const balance = await rocketVault.balanceOfToken('rocketAuctionManager', rocketTokenRPL.address);
          assert(balance.eq(web3.utils.toBN(web3.utils.toWei('800', 'ether'))));

        });


        it(printTitle('node operator', 'is slashed if withdraw is processed when balance is less than 16 ETH'), async () => {

          // Stake the prelaunch minipool (it has 16 ETH user funds)
          await stakeMinipool(prelaunchMinipool, null, {from: node});
          // Mark it as withdrawable
          await submitMinipoolWithdrawable(prelaunchMinipool.address, {from: trustedNode});
          // Post an 8 ETH balance which should result in 8 ETH worth of RPL slashing
          await withdrawValidatorBalance(prelaunchMinipool, web3.utils.toWei('8', 'ether'), nodeWithdrawalAddress, true);

          // Auction house should now have slashed 8 ETH worth of RPL (which is 800 RPL at starting price)
          const rocketVault = await RocketVault.deployed();
          const rocketTokenRPL = await RocketTokenRPL.deployed();
          const balance = await rocketVault.balanceOfToken('rocketAuctionManager', rocketTokenRPL.address);
          assert(balance.eq(web3.utils.toBN(web3.utils.toWei('800', 'ether'))));

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


        it(printTitle('random', 'random address cannot withdraw and destroy a node operators minipool balance'), async () => {

          // Wait 14 days
          await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
          // Attempt to send validator balance
          await shouldRevert(withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, random, true), 'Random address withdrew validator balance from a node operators minipool', "Only node operator can destroy minipool");

        });

        it(printTitle('random', 'random address can trigger a payout of withdrawal balance if balance is greater than 16 ETH'), async () => {

          // Wait 14 days
          await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
          // Attempt to send validator balance
          await withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, random, false);

        });

        it(printTitle('random', 'random address cannot trigger a payout of withdrawal balance if balance is less than 16 ETH'), async () => {

          // Attempt to send validator balance
          await shouldRevert(withdrawValidatorBalance(withdrawableMinipool, web3.utils.toWei('15', 'ether'), random, false), 'Random address was able to execute withdraw on sub 16 ETH minipool', 'Non-owner must wait 14 days after withdrawal to distribute balance');

        });

        it(printTitle('node operator withdrawal address', 'can withdraw their ETH once it is received, then distribute ETH to the rETH contract / deposit pool and destroy the minipool'), async () => {

          // Send validator balance and withdraw
          await withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, nodeWithdrawalAddress, true);

        });

        it(printTitle('node operator account', 'can also withdraw their ETH once it is received, then distribute ETH to the rETH contract / deposit pool and destroy the minipool'), async () => {

          // Send validator balance and withdraw
          await withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, node, true);

        });


        it(printTitle('malicious node operator', 'can not prevent a payout by using a reverting contract as withdraw address'), async () => {

            // Set the node's withdraw address to a reverting contract
            const revertOnTransfer = await RevertOnTransfer.deployed();
            await setNodeWithdrawalAddress(node, revertOnTransfer.address, {from: nodeWithdrawalAddress});
            // Wait 14 days
            await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
            // Send validator balance and withdraw and should not revert
            await withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, random, false);

        });


        it(printTitle('random address', 'can send validator balance to a withdrawable minipool in one transaction'), async () => {

            await web3.eth.sendTransaction({
                from: random,
                to: withdrawableMinipool.address,
                value: withdrawalBalance,
            });

            // Wait 14 days
            await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
            // Process validator balance
            await withdrawValidatorBalance(withdrawableMinipool, '0', random, false);

        });


        it(printTitle('random address', 'can send validator balance to a withdrawable minipool across multiple transactions'), async () => {

            // Get tx amount (half of withdrawal balance)
            let amount1 = web3.utils.toBN(withdrawalBalance).div(web3.utils.toBN(2));
            let amount2 = web3.utils.toBN(withdrawalBalance).sub(amount1);

            await web3.eth.sendTransaction({
                from: random,
                to: withdrawableMinipool.address,
                value: amount1,
            });

            await web3.eth.sendTransaction({
                from: owner,
                to: withdrawableMinipool.address,
                value: amount2,
            });

          // Wait 14 days
          await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
          // Process payout
          await withdrawValidatorBalance(withdrawableMinipool, '0', random, false);


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


        //
        // Unbonded minipools
        //


        it(printTitle('trusted node', 'cannot create an unbonded minipool if node fee is < 80% of maximum'), async () => {
            // Sanity check that current node fee is less than 80% of maximum
            let nodeFee = await getNodeFee();
            let maximumNodeFee = web3.utils.toBN(await getNetworkSetting('MaximumNodeFee'));
            assert(nodeFee.lt(maximumNodeFee.muln(0.8)), 'Node fee is greater than 80% of maximum fee');

            // Stake RPL to cover minipool
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            await mintRPL(owner, trustedNode, minipoolRplStake);
            await nodeStakeRPL(minipoolRplStake, {from: trustedNode});

            // Creating an unbonded minipool should revert
            await shouldRevert(createMinipool({from: trustedNode, value: '0'}),
              'Trusted node was able to create unbonded minipool with fee < 80% of max',
              'Current commission rate is not high enough to create unbonded minipools'
            );
        });


        it(printTitle('trusted node', 'can create an unbonded minipool if node fee is > 80% of maximum'), async () => {
            // Deposit enough unassigned ETH to increase the fee above 80% of max
            await userDeposit({from: random, value: web3.utils.toWei('900', 'ether')});

            // Sanity check that current node fee is greater than 80% of maximum
            let nodeFee = await getNodeFee();
            let maximumNodeFee = web3.utils.toBN(await getNetworkSetting('MaximumNodeFee'));
            assert(nodeFee.gt(maximumNodeFee.muln(0.8)), 'Node fee is not greater than 80% of maximum fee');

            // Stake RPL to cover minipool
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            await mintRPL(owner, trustedNode, minipoolRplStake);
            await nodeStakeRPL(minipoolRplStake, {from: trustedNode});

            // Creating the unbonded minipool
            await createMinipool({from: trustedNode, value: '0'});
        });
    });
}
