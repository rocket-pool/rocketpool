import {
  RocketDAOProtocolSettingsMinipool,
  RocketDAOProtocolSettingsNetwork,
  RocketMinipoolManager,
  RevertOnTransfer,
  RocketVault,
  RocketTokenRPL,
  RocketMinipoolQueue,
  RocketMinipool,
  RocketDAONodeTrustedSettingsMinipool
} from '../_utils/artifacts';
import { increaseTime, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { userDeposit } from '../_helpers/deposit';
import {
  getMinipoolMinimumRPLStake,
  createMinipool,
  stakeMinipool,
  submitMinipoolWithdrawable,
  dissolveMinipool,
  getNodeActiveMinipoolCount
} from '../_helpers/minipool';
import { registerNode, setNodeTrusted, setNodeWithdrawalAddress, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { close } from './scenario-close';
import { dissolve } from './scenario-dissolve';
import { refund } from './scenario-refund';
import { stake } from './scenario-stake';
import { withdrawValidatorBalance } from './scenario-withdraw-validator-balance';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import {
  setDAONodeTrustedBootstrapSetting,
  setDaoNodeTrustedBootstrapUpgrade
} from '../dao/scenario-dao-node-trusted-bootstrap';

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
        let scrubPeriod = (60 * 60 * 24); // 24 hours
        let initialisedMinipool;
        let prelaunchMinipool;
        let prelaunchMinipool2;
        let stakingMinipool;
        let withdrawableMinipool;
        let dissolvedMinipool;
        let withdrawalBalance = web3.utils.toWei('36', 'ether');
        let newDelegateAddress = '0x0000000000000000000000000000000000000001'

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
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});

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
            initialisedMinipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            dissolvedMinipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});

            // Wait required scrub period
            await increaseTime(web3, scrubPeriod + 1);

            // Progress minipools into desired statuses
            await stakeMinipool(stakingMinipool, {from: node});
            await stakeMinipool(withdrawableMinipool, {from: node});
            await submitMinipoolWithdrawable(withdrawableMinipool.address, {from: trustedNode});
            await dissolveMinipool(dissolvedMinipool, {from: node});

            // Check minipool statuses
            let initialisedStatus = await initialisedMinipool.getStatus.call();
            let prelaunchStatus = await prelaunchMinipool.getStatus.call();
            let prelaunch2Status = await prelaunchMinipool2.getStatus.call();
            let stakingStatus = await stakingMinipool.getStatus.call();
            let withdrawableStatus = await withdrawableMinipool.getStatus.call();
            let dissolvedStatus = await dissolvedMinipool.getStatus.call();
            assert(initialisedStatus.eq(web3.utils.toBN(0)), 'Incorrect initialised minipool status');
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

            // Check minipool queues
            const rocketMinipoolQueue = await RocketMinipoolQueue.deployed()
            const [totalLength, fullLength, halfLength, emptyLength] = await Promise.all([
              rocketMinipoolQueue.getTotalLength(),   // Total
              rocketMinipoolQueue.getLength(1),       // Full
              rocketMinipoolQueue.getLength(2),       // Half
              rocketMinipoolQueue.getLength(3),       // Empty
            ])

            // Total should match sum
            assert(totalLength.eq(fullLength.add(halfLength).add(emptyLength)));
            assert(fullLength.toNumber() === 2, 'Incorrect number of minipools in full queue')
            assert(halfLength.toNumber() === 1, 'Incorrect number of minipools in half queue')
            assert(emptyLength.toNumber() === 0, 'Incorrect number of minipools in empty queue')
        });


        async function upgradeNetworkDelegateContract() {
          // Upgrade the delegate contract
          await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketMinipoolDelegate', [], newDelegateAddress, {
            from: owner,
          });

          // Check effective delegate is still the original
          const minipool = await RocketMinipool.at(stakingMinipool.address);
          const effectiveDelegate = await minipool.getEffectiveDelegate.call()
          assert(effectiveDelegate !== newDelegateAddress, "Effective delegate was updated")
        }


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
            let withdrawalCredentials = await initialisedMinipool.getWithdrawalCredentials.call();

            // Check withdrawal credentials
            let expectedWithdrawalCredentials = ('0x' + withdrawalPrefix + padding + initialisedMinipool.address.substr(2));
            assert.equal(withdrawalCredentials.toLowerCase(), expectedWithdrawalCredentials.toLowerCase(), 'Invalid minipool withdrawal credentials');

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


        it(printTitle('node operator', 'cannot create a minipool if delegate address is set to a non-contract'), async () => {

          // Upgrade network delegate contract to random address
          await upgradeNetworkDelegateContract();
          // Creating minipool should fail now
          await shouldRevert(createMinipool({from: node, value: web3.utils.toWei('32', 'ether')}), 'Was able to create a minipool with bad delegate address', 'Contract creation failed');

        });


        it(printTitle('node operator', 'cannot delegatecall to a delgate address that is a non-contract'), async () => {

          // Creating minipool should fail now
          let newMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
          const newMinipoolBase = await RocketMinipool.at(newMinipool.address);
          // Upgrade network delegate contract to random address
          await upgradeNetworkDelegateContract();
          // Call upgrade delegate
          await newMinipoolBase.setUseLatestDelegate(true, {from: node})
          // Staking should fail now
          await shouldRevert(stakeMinipool(newMinipool, {from: node}), 'Was able to create a minipool with bad delegate address', 'Delegate contract does not exist');

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
        // Finalise
        //


        it(printTitle('node operator', 'can finalise a withdrawn minipool'), async () => {

          // Wait 14 days
          await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
          // Withdraw without finalising
          await withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, random, false);
          // Get number of active minipools before
          const count1 = await getNodeActiveMinipoolCount(node);
          // Finalise
          await withdrawableMinipool.finalise({ from: nodeWithdrawalAddress });
          // Get number of active minipools after
          const count2 = await getNodeActiveMinipoolCount(node);
          // Make sure active minipool count reduced by one
          assert(count1.sub(count2).eq(web3.utils.toBN(1)), "Active minipools did not decrement by 1");

        });


        it(printTitle('node operator', 'cannot finalise a withdrawn minipool twice'), async () => {

          // Wait 14 days
          await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
          // Withdraw without finalising
          await withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, random, false);
          // Finalise
          await withdrawableMinipool.finalise({ from: nodeWithdrawalAddress });
          // Second time should fail
          await shouldRevert(withdrawableMinipool.finalise({ from: nodeWithdrawalAddress }), "Was able to finalise pool twice", "Minipool has already been finalised");

        });


      it(printTitle('node operator', 'cannot finalise a non-withdrawn minipool'), async () => {

          // Finalise
          await shouldRevert(withdrawableMinipool.finalise({ from: nodeWithdrawalAddress }), 'Minipool was finalised before withdrawn', 'Minipool balance must have been distributed at least once');

        });


        it(printTitle('random address', 'cannot finalise a withdrawn minipool'), async () => {

          // Wait 14 days
          await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
          // Withdraw without finalising
          await withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, random, false);
          // Finalise
          await shouldRevert(withdrawableMinipool.finalise({ from: random }), 'Minipool was finalised by random', 'Invalid minipool owner');

        });


        //
        // Slash
        //


        it(printTitle('random address', 'can slash node operator if withdrawal balance is less than 16 ETH'), async () => {

          // Stake the prelaunch minipool (it has 16 ETH user funds)
          await stakeMinipool(prelaunchMinipool, {from: node});
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
          await stakeMinipool(prelaunchMinipool, {from: node});
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
            await dissolve(initialisedMinipool, {
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

            // Attempt to dissolve initialised minipool
            await shouldRevert(dissolve(initialisedMinipool, {
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
            await stake(prelaunchMinipool, null, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot stake a minipool which is not at prelaunch'), async () => {

            // Attempt to stake initialised minipool
            await shouldRevert(stake(initialisedMinipool, null, {
                from: node,
            }), 'Staked a minipool which was not at prelaunch');

        });


        it(printTitle('node operator', 'cannot stake a minipool with a reused validator pubkey'), async () => {

          // Load contracts
          const rocketMinipoolManager = await RocketMinipoolManager.deployed();

          // Get minipool validator pubkey
          const validatorPubkey = await rocketMinipoolManager.getMinipoolPubkey(prelaunchMinipool.address);

          // Stake prelaunch minipool
          await stake(prelaunchMinipool, null, {from: node});

          // Attempt to stake second prelaunch minipool with same pubkey
          await shouldRevert(stake(prelaunchMinipool2, null, {
              from: node,
          }, validatorPubkey), 'Staked a minipool with a reused validator pubkey');

        });


        it(printTitle('node operator', 'cannot stake a minipool with incorrect withdrawal credentials'), async () => {

            // Get withdrawal credentials
            let invalidWithdrawalCredentials = '0x1111111111111111111111111111111111111111111111111111111111111111';

            // Attempt to stake prelaunch minipool
            await shouldRevert(stake(prelaunchMinipool, invalidWithdrawalCredentials, {
                from: node,
            }), 'Staked a minipool with incorrect withdrawal credentials');

        });


        it(printTitle('random address', 'cannot stake a minipool'), async () => {

            // Attempt to stake prelaunch minipool
            await shouldRevert(stake(prelaunchMinipool, null, {
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
          await shouldRevert(withdrawValidatorBalance(withdrawableMinipool, withdrawalBalance, random, true), 'Random address withdrew validator balance from a node operators minipool', "Invalid minipool owner");

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

            // Send 16 ETH to minipool
            await web3.eth.sendTransaction({
              from: random,
              to: dissolvedMinipool.address,
              value: web3.utils.toWei('16', 'ether'),
            });

            // Close dissolved minipool
            await close(dissolvedMinipool, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot close a minipool which is not dissolved'), async () => {

            // Attempt to close staking minipool
            await shouldRevert(close(stakingMinipool, {
                from: node,
            }), 'Closed a minipool which was not dissolved', 'The minipool can only be closed while dissolved');

        });


        it(printTitle('random address', 'cannot close a dissolved minipool'), async () => {

            // Attempt to close dissolved minipool
            await shouldRevert(close(dissolvedMinipool, {
                from: random,
            }), 'Random address closed a minipool', 'Invalid minipool owner');

        });


        //
        // Unbonded minipools (temporarily removed)
        //


        // it(printTitle('trusted node', 'cannot create an unbonded minipool if node fee is < 80% of maximum'), async () => {
        //     // Sanity check that current node fee is less than 80% of maximum
        //     let nodeFee = await getNodeFee();
        //     let maximumNodeFee = web3.utils.toBN(await getNetworkSetting('MaximumNodeFee'));
        //     assert(nodeFee.lt(maximumNodeFee.muln(0.8)), 'Node fee is greater than 80% of maximum fee');
        //
        //     // Stake RPL to cover minipool
        //     let minipoolRplStake = await getMinipoolMinimumRPLStake();
        //     await mintRPL(owner, trustedNode, minipoolRplStake);
        //     await nodeStakeRPL(minipoolRplStake, {from: trustedNode});
        //
        //     // Creating an unbonded minipool should revert
        //     await shouldRevert(createMinipool({from: trustedNode, value: '0'}),
        //       'Trusted node was able to create unbonded minipool with fee < 80% of max',
        //       'Current commission rate is not high enough to create unbonded minipools'
        //     );
        // });
        //
        //
        // it(printTitle('trusted node', 'can create an unbonded minipool if node fee is > 80% of maximum'), async () => {
        //     // Deposit enough unassigned ETH to increase the fee above 80% of max
        //     await userDeposit({from: random, value: web3.utils.toWei('900', 'ether')});
        //
        //     // Sanity check that current node fee is greater than 80% of maximum
        //     let nodeFee = await getNodeFee();
        //     let maximumNodeFee = web3.utils.toBN(await getNetworkSetting('MaximumNodeFee'));
        //     assert(nodeFee.gt(maximumNodeFee.muln(0.8)), 'Node fee is not greater than 80% of maximum fee');
        //
        //     // Stake RPL to cover minipool
        //     let minipoolRplStake = await getMinipoolMinimumRPLStake();
        //     await mintRPL(owner, trustedNode, minipoolRplStake);
        //     await nodeStakeRPL(minipoolRplStake, {from: trustedNode});
        //
        //     // Creating the unbonded minipool
        //     await createMinipool({from: trustedNode, value: '0'});
        // });


        //
        // Delegate upgrades
        //

        it(printTitle('node operator', 'can upgrade and rollback their delegate contract'), async () => {
          await upgradeNetworkDelegateContract();
          // Get contract
          const minipool = await RocketMinipool.at(stakingMinipool.address);
          // Store original delegate
          let originalDelegate = await minipool.getEffectiveDelegate.call();
          // Call upgrade delegate
          await minipool.delegateUpgrade({from: node});
          // Check delegate settings
          let effectiveDelegate = await minipool.getEffectiveDelegate.call();
          let previousDelegate = await minipool.getPreviousDelegate.call();
          assert(effectiveDelegate === newDelegateAddress, "Effective delegate was not updated");
          assert(previousDelegate === originalDelegate, "Previous delegate was not updated");
          // Call upgrade rollback
          await minipool.delegateRollback({from: node});
          // Check effective delegate
          effectiveDelegate = await minipool.getEffectiveDelegate.call();
          assert(effectiveDelegate === originalDelegate, "Effective delegate was not rolled back");
        });


        it(printTitle('node operator', 'can use latest delegate contract'), async () => {
          await upgradeNetworkDelegateContract();
          // Get contract
          const minipool = await RocketMinipool.at(stakingMinipool.address);
          // Store original delegate
          let originalDelegate = await minipool.getEffectiveDelegate.call()
          // Call upgrade delegate
          await minipool.setUseLatestDelegate(true, {from: node})
          let useLatest = await minipool.getUseLatestDelegate.call()
          assert(useLatest, "Use latest flag was not set")
          // Check delegate settings
          let effectiveDelegate = await minipool.getEffectiveDelegate.call()
          let currentDelegate = await minipool.getDelegate.call()
          assert(effectiveDelegate === newDelegateAddress, "Effective delegate was not updated")
          assert(currentDelegate === originalDelegate, "Current delegate was updated")
          // Upgrade the delegate contract again
          newDelegateAddress = '0x0000000000000000000000000000000000000002'
          await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketMinipoolDelegate', [], newDelegateAddress, {
            from: owner,
          });
          // Check effective delegate
          effectiveDelegate = await minipool.getEffectiveDelegate.call();
          assert(effectiveDelegate === newDelegateAddress, "Effective delegate was not updated");
        });


        it(printTitle('random', 'cannot upgrade, rollback or set use latest delegate contract'), async () => {
          await upgradeNetworkDelegateContract();
          // Get contract
          const minipool = await RocketMinipool.at(stakingMinipool.address);
          // Call upgrade delegate from random
          await shouldRevert(minipool.delegateUpgrade({from: random}), "Random was able to upgrade delegate", "Only the node operator can access this method");
          // Call upgrade delegate from node
          await minipool.delegateUpgrade({from: node});
          // Call upgrade rollback from random
          await shouldRevert(minipool.delegateRollback({from: random}), "Random was able to rollback delegate", "Only the node operator can access this method") ;
          // Call set use latest from random
          await shouldRevert(minipool.setUseLatestDelegate(true, {from: random}), "Random was able to set use latest delegate", "Only the node operator can access this method") ;
        });
    });
}
