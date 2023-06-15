import {
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketMinipoolManager,
    RevertOnTransfer,
    RocketVault,
    RocketTokenRPL,
    RocketDAONodeTrustedSettingsMinipool,
    RocketMinipoolBase,
    RocketMinipoolBondReducer,
    RocketDAOProtocolSettingsRewards, RocketNodeManager, RocketMinipoolDelegate, RocketNodeDistributorFactory,
} from '../_utils/artifacts';
import { increaseTime } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { userDeposit } from '../_helpers/deposit';
import {
    getMinipoolMinimumRPLStake,
    createMinipool,
    stakeMinipool,
    dissolveMinipool,
    getNodeActiveMinipoolCount, promoteMinipool, minipoolStates,
} from '../_helpers/minipool';
import {
    registerNode,
    setNodeTrusted,
    setNodeWithdrawalAddress,
    nodeStakeRPL,
    getNodeAverageFee,
} from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { close } from './scenario-close';
import { dissolve } from './scenario-dissolve';
import { refund } from './scenario-refund';
import { stake } from './scenario-stake';
import { beginUserDistribute, withdrawValidatorBalance } from './scenario-withdraw-validator-balance';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import {
  setDAONodeTrustedBootstrapSetting,
  setDaoNodeTrustedBootstrapUpgrade
} from '../dao/scenario-dao-node-trusted-bootstrap';
import { reduceBond } from './scenario-reduce-bond';
import { assertBN } from '../_helpers/bn';
import { skimRewards } from './scenario-skim-rewards';
import { artifacts } from 'hardhat';

export default function() {
    contract('RocketMinipool', async (accounts) => {

        // Accounts
        const [
            owner,
            node,
            emptyNode,
            nodeWithdrawalAddress,
            trustedNode,
            dummySwc,
            random,
        ] = accounts;


        // Setup
        let launchTimeout =  (60 * 60 * 72); // 72 hours
        let withdrawalDelay = 20;
        let scrubPeriod = (60 * 60 * 24); // 24 hours
        let bondReductionWindowStart = (2 * 24 * 60 * 60);
        let bondReductionWindowLength = (2 * 24 * 60 * 60);
        let rewardClaimPeriodTime = (28 * 24 * 60 * 60); // 28 days
        let userDistributeTime = (90 * 24 * 60 * 60); // 90 days
        let initialisedMinipool;
        let prelaunchMinipool;
        let prelaunchMinipool2;
        let stakingMinipool;
        let dissolvedMinipool;
        let withdrawalBalance = '36'.ether;
        let newDelegateAddress = '0x0000000000000000000000000000000000000001';
        let oldDelegateAddress;

        const lebDepositNodeAmount = '8'.ether;
        const halfDepositNodeAmount = '16'.ether;

        before(async () => {
            oldDelegateAddress = (await RocketMinipoolDelegate.deployed()).address;

            // Register node & set withdrawal address
            await registerNode({from: node});
            await setNodeWithdrawalAddress(node, nodeWithdrawalAddress, {from: node});

            // Register empty node
            await registerNode({from: emptyNode});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, {from: owner});
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.start', bondReductionWindowStart, {from: owner});
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.length', bondReductionWindowLength, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rpl.rewards.claim.period.time', rewardClaimPeriodTime, {from: owner});

            // Set rETH collateralisation target to a value high enough it won't cause excess ETH to be funneled back into deposit pool and mess with our calcs
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.reth.collateral.target', '50'.ether, {from: owner});

            // Set user distribute time
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.user.distribute.window.start', userDistributeTime, {from: owner});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul('7'.BN);
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Create a dissolved minipool
            await userDeposit({ from: random, value: '16'.ether, });
            dissolvedMinipool = await createMinipool({from: node, value: '16'.ether});
            await increaseTime(web3, launchTimeout + 1);
            await dissolveMinipool(dissolvedMinipool, {from: node});

            // Create minipools
            await userDeposit({ from: random, value: '46'.ether, });
            prelaunchMinipool = await createMinipool({from: node, value: '16'.ether});
            prelaunchMinipool2 = await createMinipool({from: node, value: '16'.ether});
            stakingMinipool = await createMinipool({from: node, value: '16'.ether});
            initialisedMinipool = await createMinipool({from: node, value: '16'.ether});

            // Wait required scrub period
            await increaseTime(web3, scrubPeriod + 1);

            // Progress minipools into desired statuses
            await stakeMinipool(stakingMinipool, {from: node});

            // Check minipool statuses
            let initialisedStatus = await initialisedMinipool.getStatus.call();
            let prelaunchStatus = await prelaunchMinipool.getStatus.call();
            let prelaunch2Status = await prelaunchMinipool2.getStatus.call();
            let stakingStatus = await stakingMinipool.getStatus.call();
            let dissolvedStatus = await dissolvedMinipool.getStatus.call();
            assertBN.equal(initialisedStatus, minipoolStates.Initialised, 'Incorrect initialised minipool status');
            assertBN.equal(prelaunchStatus, minipoolStates.Prelaunch, 'Incorrect prelaunch minipool status');
            assertBN.equal(prelaunch2Status, minipoolStates.Prelaunch, 'Incorrect prelaunch minipool status');
            assertBN.equal(stakingStatus, minipoolStates.Staking, 'Incorrect staking minipool status');
            assertBN.equal(dissolvedStatus, minipoolStates.Dissolved, 'Incorrect dissolved minipool status');
        });


        async function upgradeNetworkDelegateContract() {
          // Upgrade the delegate contract
          await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketMinipoolDelegate', [], newDelegateAddress, {
            from: owner,
          });

          // Check effective delegate is still the original
          const minipool = await RocketMinipoolBase.at(stakingMinipool.address);
          const effectiveDelegate = await minipool.getEffectiveDelegate.call()
          assert.notEqual(effectiveDelegate, newDelegateAddress, "Effective delegate was updated")
        }


        async function resetNetworkDelegateContract() {
            // Upgrade the delegate contract
            await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketMinipoolDelegate', [], oldDelegateAddress, {
                from: owner,
            });
        }


        //
        // General
        //


        it(printTitle('random address', 'cannot send ETH to non-payable minipool delegate methods'), async () => {

            // Attempt to send ETH to view method
            await shouldRevert(prelaunchMinipool.getStatus({
                from: random,
                value: '1'.ether,
            }), 'Sent ETH to a non-payable minipool delegate view method');

            // Attempt to send ETH to mutator method
            await shouldRevert(refund(prelaunchMinipool, {
                from: node,
                value: '1'.ether,
            }), 'Sent ETH to a non-payable minipool delegate mutator method');

        });


        it(printTitle('minipool', 'has correct withdrawal credentials'), async () => {

            // Get contracts
            const rocketMinipoolManager = await RocketMinipoolManager.deployed()

            // Withdrawal credentials settings
            const withdrawalPrefix = '01';
            const padding = '0000000000000000000000';

            // Get minipool withdrawal credentials
            let withdrawalCredentials = await rocketMinipoolManager.getMinipoolWithdrawalCredentials.call(initialisedMinipool.address);

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
          await shouldRevert(createMinipool({from: node, value: '16'.ether}), 'Was able to create a minipool when capacity is reached', 'Global minipool limit reached');
          // Destroy a pool
          await withdrawValidatorBalance(stakingMinipool, withdrawalBalance, nodeWithdrawalAddress, true);
          // Creating minipool should no longer fail
          await createMinipool({from: node, value: '16'.ether});
        });


        it(printTitle('node operator', 'cannot create a minipool if delegate address is set to a non-contract'), async () => {

          // Upgrade network delegate contract to random address
          await upgradeNetworkDelegateContract();
          // Creating minipool should fail now
          await shouldRevert(createMinipool({from: node, value: '16'.ether}), 'Was able to create a minipool with bad delegate address', 'Delegate contract does not exist');

        });


        it(printTitle('node operator', 'cannot delegatecall to a delgate address that is a non-contract'), async () => {

          // Creating minipool should fail now
          let newMinipool = await createMinipool({from: node, value: '16'.ether});
          const newMinipoolBase = await RocketMinipoolBase.at(newMinipool.address);
          // Upgrade network delegate contract to random address
          await upgradeNetworkDelegateContract();
          // Call upgrade delegate
          await newMinipoolBase.setUseLatestDelegate(true, {from: node})
          // Staking should fail now
          await shouldRevert(stakeMinipool(newMinipool, {from: node}), 'Was able to create a minipool with bad delegate address', 'Delegate contract does not exist');

          // Reset the delegate to working contract to prevent invariant tests from failing
          await resetNetworkDelegateContract();
        });


        //
        // Finalise
        //


        it(printTitle('node operator', 'can finalise a user withdrawn minipool'), async () => {
            // Send enough ETH to allow distribution
            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: withdrawalBalance
            });
            // Begin user distribution process
            await beginUserDistribute(stakingMinipool, {from: random});
            // Wait 14 days
            await increaseTime(web3, userDistributeTime + 1)
            // Withdraw without finalising
            await withdrawValidatorBalance(stakingMinipool, withdrawalBalance, random);
            // Get number of active minipools before
            const count1 = await getNodeActiveMinipoolCount(node);
            // Finalise
            await stakingMinipool.finalise({ from: nodeWithdrawalAddress });
            // Get number of active minipools after
            const count2 = await getNodeActiveMinipoolCount(node);
            // Make sure active minipool count reduced by one
            assertBN.equal(count1.sub(count2), 1, "Active minipools did not decrement by 1");
        });


        it(printTitle('node operator', 'cannot finalise a withdrawn minipool twice'), async () => {
            // Send enough ETH to allow distribution
            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: withdrawalBalance
            });
            // Begin user distribution process
            await beginUserDistribute(stakingMinipool, {from: random});
            // Wait 14 days
            await increaseTime(web3, userDistributeTime + 1)
            // Withdraw without finalising
            await withdrawValidatorBalance(stakingMinipool, withdrawalBalance, random);
            // Finalise
            await stakingMinipool.finalise({ from: nodeWithdrawalAddress });
            // Second time should fail
            await shouldRevert(stakingMinipool.finalise({ from: nodeWithdrawalAddress }), "Was able to finalise pool twice", "Minipool has already been finalised");
        });


        it(printTitle('node operator', 'cannot finalise a non-withdrawn minipool'), async () => {
            // Finalise
            await shouldRevert(stakingMinipool.finalise({ from: nodeWithdrawalAddress }), 'Minipool was finalised before withdrawn', 'Can only manually finalise after user distribution');
        });


        it(printTitle('random address', 'cannot finalise a withdrawn minipool'), async () => {
          // Withdraw without finalising
          await withdrawValidatorBalance(stakingMinipool, withdrawalBalance, nodeWithdrawalAddress);
          // Finalise
          await shouldRevert(stakingMinipool.finalise({ from: random }), 'Minipool was finalised by random', 'Invalid minipool owner');
        });


        //
        // Slash
        //


        it(printTitle('random address', 'can slash node operator if withdrawal balance is less than 16 ETH'), async () => {
            // Stake the prelaunch minipool (it has 16 ETH user funds)
            await stakeMinipool(prelaunchMinipool, {from: node});
            // Send enough ETH to allow distribution
            await web3.eth.sendTransaction({
                from: owner,
                to: prelaunchMinipool.address,
                value: '8'.ether
            });
            // Begin user distribution process
            await beginUserDistribute(prelaunchMinipool, {from: random});
            // Wait 14 days
            await increaseTime(web3, userDistributeTime + 1)
            // Post an 8 ETH balance which should result in 8 ETH worth of RPL slashing
            await withdrawValidatorBalance(prelaunchMinipool, '0'.ether, random);
            // Call slash method
            await prelaunchMinipool.slash({ from: random });
            // Check slashed flag
            const slashed = await (await RocketMinipoolManager.deployed()).getMinipoolRPLSlashed(prelaunchMinipool.address);
            assert(slashed, "Slashed flag not set");
            // Auction house should now have slashed 8 ETH worth of RPL (which is 800 RPL at starting price)
            const rocketVault = await RocketVault.deployed();
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            const balance = await rocketVault.balanceOfToken('rocketAuctionManager', rocketTokenRPL.address);
            assertBN.equal(balance, '800'.ether);
        });


        it(printTitle('node operator', 'is slashed if withdraw is processed when balance is less than 16 ETH'), async () => {
            // Stake the prelaunch minipool (it has 16 ETH user funds)
            await stakeMinipool(prelaunchMinipool, {from: node});
            // Post an 8 ETH balance which should result in 8 ETH worth of RPL slashing
            await withdrawValidatorBalance(prelaunchMinipool, '8'.ether, nodeWithdrawalAddress, true);
            // Check slashed flag
            const slashed = await (await RocketMinipoolManager.deployed()).getMinipoolRPLSlashed(prelaunchMinipool.address);
            assert(slashed, "Slashed flag not set");
            // Auction house should now have slashed 8 ETH worth of RPL (which is 800 RPL at starting price)
            const rocketVault = await RocketVault.deployed();
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            const balance = await rocketVault.balanceOfToken('rocketAuctionManager', rocketTokenRPL.address);
            assertBN.equal(balance, '800'.ether);
        });


        //
        // Dissolve
        //


        it(printTitle('node operator', 'cannot dissolve their own staking minipools'), async () => {
            // Attempt to dissolve staking minipool
            await shouldRevert(dissolve(stakingMinipool, {
                from: node,
            }), 'Dissolved a staking minipool');
        });


        it(printTitle('random address', 'can dissolve a timed out minipool at prelaunch'), async () => {
            // Time prelaunch minipool out
            await increaseTime(web3, launchTimeout);

            // Dissolve prelaunch minipool
            await dissolve(prelaunchMinipool, {
                from: random,
            });
        });


        it(printTitle('random address', 'cannot dissolve a minipool which is not at prelaunch'), async () => {
            // Time prelaunch minipool out
            await increaseTime(web3, launchTimeout);

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
            await shouldRevert(withdrawValidatorBalance(stakingMinipool, withdrawalBalance, random, true), 'Random address withdrew validator balance from a node operators minipool', "Only owner can distribute right now");
        });


        it(printTitle('random', 'random address can trigger a payout of withdrawal balance if balance is greater than 16 ETH'), async () => {
            // Send enough ETH to allow distribution
            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: '32'.ether
            });
            // Begin user distribution process
            await beginUserDistribute(stakingMinipool, {from: random});
            // Wait 14 days
            await increaseTime(web3, userDistributeTime + 1)
            // Post an 8 ETH balance which should result in 8 ETH worth of RPL slashing
            await withdrawValidatorBalance(stakingMinipool, '0'.ether, random);
        });


        it(printTitle('random', 'random address cannot trigger a payout of withdrawal balance if balance is less than 16 ETH'), async () => {
          // Attempt to send validator balance
          await shouldRevert(withdrawValidatorBalance(stakingMinipool, '15'.ether, random, false), 'Random address was able to execute withdraw on sub 16 ETH minipool', 'Only owner can distribute right now');
        });


        it(printTitle('node operator withdrawal address', 'can withdraw their ETH once it is received, then distribute ETH to the rETH contract / deposit pool and destroy the minipool'), async () => {
          // Send validator balance and withdraw
          await withdrawValidatorBalance(stakingMinipool, withdrawalBalance, nodeWithdrawalAddress, true);
        });


        it(printTitle('node operator account', 'can also withdraw their ETH once it is received, then distribute ETH to the rETH contract / deposit pool and destroy the minipool'), async () => {
          // Send validator balance and withdraw
          await withdrawValidatorBalance(stakingMinipool, withdrawalBalance, node, true);
        });


        it(printTitle('malicious node operator', 'can not prevent a payout by using a reverting contract as withdraw address'), async () => {
            // Set the node's withdraw address to a reverting contract
            const revertOnTransfer = await RevertOnTransfer.deployed();
            await setNodeWithdrawalAddress(node, revertOnTransfer.address, {from: nodeWithdrawalAddress});
            // Wait 14 days
            await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
            // Send enough ETH to allow distribution
            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: withdrawalBalance
            });
            // Begin user distribution process
            await beginUserDistribute(stakingMinipool, {from: random});
            // Wait 14 days
            await increaseTime(web3, userDistributeTime + 1)
            // Post an 8 ETH balance which should result in 8 ETH worth of RPL slashing
            await withdrawValidatorBalance(stakingMinipool, '0'.ether, random);
        });


        it(printTitle('random address', 'can send validator balance to a withdrawable minipool in one transaction'), async () => {
            await web3.eth.sendTransaction({
                from: random,
                to: stakingMinipool.address,
                value: withdrawalBalance,
            });

            // Begin user distribution process
            await beginUserDistribute(stakingMinipool, {from: random});
            // Wait 14 days
            await increaseTime(web3, userDistributeTime + 1)
            // Post an 8 ETH balance which should result in 8 ETH worth of RPL slashing
            await withdrawValidatorBalance(stakingMinipool, '0'.ether, random);
        });


        it(printTitle('random address', 'can send validator balance to a withdrawable minipool across multiple transactions'), async () => {
            // Get tx amount (half of withdrawal balance)
            let amount1 = withdrawalBalance.div('2'.BN);
            let amount2 = withdrawalBalance.sub(amount1);

            await web3.eth.sendTransaction({
                from: random,
                to: stakingMinipool.address,
                value: amount1,
            });

            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: amount2,
            });

            // Begin user distribution process
            await beginUserDistribute(stakingMinipool, {from: random});
            // Wait 14 days
            await increaseTime(web3, userDistributeTime + 1)
            // Post an 8 ETH balance which should result in 8 ETH worth of RPL slashing
            await withdrawValidatorBalance(stakingMinipool, '0'.ether, random);
        });


        //
        // Skim rewards
        //


        it(printTitle('node operator', 'can skim rewards less than 8 ETH'), async () => {
            // Send 1 ETH to the minipool
            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: '1'.ether,
            });
            // Skim rewards from node
            await skimRewards(stakingMinipool, {from: node});
        });


        it(printTitle('random user', 'can skim rewards less than 8 ETH'), async () => {
            // Send 1 ETH to the minipool
            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: '1'.ether,
            });
            // Skim rewards from node
            await skimRewards(stakingMinipool, {from: random});
        });


        it(printTitle('random user', 'can skim rewards less than 8 ETH twice'), async () => {
            // Send 1 ETH to the minipool
            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: '1'.ether,
            });
            // Skim rewards from random
            await skimRewards(stakingMinipool, {from: random});
            // Send 1 ETH to the minipool
            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: '1'.ether,
            });
            // Skim rewards from random
            await skimRewards(stakingMinipool, {from: random});
        });


        it(printTitle('random user + node operator', 'can skim rewards less than 8 ETH twice interchangeably'), async () => {
            // Send 1 ETH to the minipool
            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: '1.5'.ether,
            });
            // Skim rewards from random
            await skimRewards(stakingMinipool, {from: random});
            // Send 1 ETH to the minipool
            await web3.eth.sendTransaction({
                from: owner,
                to: stakingMinipool.address,
                value: '2'.ether,
            });
            // Skim rewards from node
            await skimRewards(stakingMinipool, {from: node});
        });


        //
        // Close
        //


        it(printTitle('node operator', 'can close a dissolved minipool'), async () => {
            // Send 16 ETH to minipool
            await web3.eth.sendTransaction({
              from: random,
              to: dissolvedMinipool.address,
              value: '16'.ether,
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
        // Delegate upgrades
        //


        it(printTitle('node operator', 'can upgrade and rollback their delegate contract'), async () => {
            await upgradeNetworkDelegateContract();
            // Get contract
            const minipool = await RocketMinipoolBase.at(stakingMinipool.address);
            // Store original delegate
            let originalDelegate = await minipool.getEffectiveDelegate.call();
            // Call upgrade delegate
            await minipool.delegateUpgrade({from: node});
            // Check delegate settings
            let effectiveDelegate = await minipool.getEffectiveDelegate.call();
            let previousDelegate = await minipool.getPreviousDelegate.call();
            assert.strictEqual(effectiveDelegate, newDelegateAddress, "Effective delegate was not updated");
            assert.strictEqual(previousDelegate, originalDelegate, "Previous delegate was not updated");
            // Call upgrade rollback
            await minipool.delegateRollback({from: node});
            // Check effective delegate
            effectiveDelegate = await minipool.getEffectiveDelegate.call();
            assert.strictEqual(effectiveDelegate, originalDelegate, "Effective delegate was not rolled back");
        });


        it(printTitle('node operator', 'can use latest delegate contract'), async () => {
          await upgradeNetworkDelegateContract();
          // Get contract
          const minipool = await RocketMinipoolBase.at(stakingMinipool.address);
          // Store original delegate
          let originalDelegate = await minipool.getEffectiveDelegate.call()
          // Call upgrade delegate
          await minipool.setUseLatestDelegate(true, {from: node})
          let useLatest = await minipool.getUseLatestDelegate.call()
          assert.isTrue(useLatest, "Use latest flag was not set")
          // Check delegate settings
          let effectiveDelegate = await minipool.getEffectiveDelegate.call()
          let currentDelegate = await minipool.getDelegate.call()
          assert.strictEqual(effectiveDelegate, newDelegateAddress, "Effective delegate was not updated")
          assert.strictEqual(currentDelegate, originalDelegate, "Current delegate was updated")
          // Upgrade the delegate contract again
          newDelegateAddress = '0x0000000000000000000000000000000000000002'
          await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketMinipoolDelegate', [], newDelegateAddress, {
            from: owner,
          });
          // Check effective delegate
          effectiveDelegate = await minipool.getEffectiveDelegate.call();
          assert.strictEqual(effectiveDelegate, newDelegateAddress, "Effective delegate was not updated");
          // Reset the delegate to working contract to prevent invariant tests from failing
          await resetNetworkDelegateContract();
        });


        it(printTitle('random', 'cannot upgrade, rollback or set use latest delegate contract'), async () => {
          await upgradeNetworkDelegateContract();
          // Get contract
          const minipool = await RocketMinipoolBase.at(stakingMinipool.address);
          // Call upgrade delegate from random
          await shouldRevert(minipool.delegateUpgrade({from: random}), "Random was able to upgrade delegate", "Only the node operator can access this method");
          // Call upgrade delegate from node
          await minipool.delegateUpgrade({from: node});
          // Call upgrade rollback from random
          await shouldRevert(minipool.delegateRollback({from: random}), "Random was able to rollback delegate", "Only the node operator can access this method") ;
          // Call set use latest from random
          await shouldRevert(minipool.setUseLatestDelegate(true, {from: random}), "Random was able to set use latest delegate", "Only the node operator can access this method") ;
          // Reset the delegate to working contract to prevent invariant tests from failing
          await resetNetworkDelegateContract();
          await minipool.delegateUpgrade({from: node});
        });


        //
        // Reducing bond amount
        //


        it(printTitle('node operator', 'can reduce bond amount to a valid deposit amount'), async () => {
            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Signal wanting to reduce
            await rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '8'.ether, {from: node});
            await increaseTime(web3, bondReductionWindowStart + 1);
            // Reduction from 16 ETH to 8 ETH should be valid
            await reduceBond(stakingMinipool, {from: node});
        });


        it(printTitle('node operator', 'average node fee gets updated correctly on bond reduction'), async () => {
            // Get contracts
            const rocketNodeManager = await RocketNodeManager.deployed();
            // Set the network node fee to 20%
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', '0.20'.ether, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', '0.20'.ether, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', '0.20'.ether, {from: owner});
            // Stake RPL to cover a 16 ETH and an 8 ETH minipool (1.6 + 2.4)
            let rplStake = '400'.ether
            await mintRPL(owner, emptyNode, rplStake);
            await nodeStakeRPL(rplStake, {from: emptyNode});
            // Deposit enough user funds to cover minipool creation
            await userDeposit({ from: random, value: '64'.ether, });
            // Create the minipools
            let minipool1 = await createMinipool({from: emptyNode, value: '16'.ether});
            let minipool2 = await createMinipool({from: emptyNode, value: '16'.ether});
            // Wait required scrub period
            await increaseTime(web3, scrubPeriod + 1);
            // Progress minipools into desired statuses
            await stakeMinipool(minipool1, {from: emptyNode});
            await stakeMinipool(minipool2, {from: emptyNode});
            // Set the network node fee to 10%
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', '0.10'.ether, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', '0.10'.ether, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', '0.10'.ether, {from: owner});
            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Signal wanting to reduce
            await rocketMinipoolBondReducer.beginReduceBondAmount(minipool1.address, '8'.ether, {from: emptyNode});
            await increaseTime(web3, bondReductionWindowStart + 1);
            // Reduction from 16 ETH to 8 ETH should be valid
            let fee1 = await rocketNodeManager.getAverageNodeFee(emptyNode);
            await reduceBond(minipool1, {from: emptyNode});
            let fee2 = await rocketNodeManager.getAverageNodeFee(emptyNode);
            /*
                Node operator now has 1x 16 ETH bonded minipool at 20% node fee and 1x 8 ETH bonded minipool at 10% fee
                Before bond reduction average node fee should be 20%, weighted average node fee after should be 14%
             */
            assertBN.equal(fee1, '0.20'.ether, 'Incorrect node fee');
            assertBN.equal(fee2, '0.14'.ether, 'Incorrect node fee');
        });


        it(printTitle('node operator', 'can reduce bond amount to a valid deposit amount after reward period'), async () => {
            // Upgrade RocketNodeDeposit to add 4 ETH LEB support
            const RocketNodeDepositLEB4 = artifacts.require('RocketNodeDepositLEB4.sol');
            const rocketNodeDepositLEB4 = await RocketNodeDepositLEB4.deployed();
            await setDaoNodeTrustedBootstrapUpgrade("upgradeContract", "rocketNodeDeposit", RocketNodeDepositLEB4.abi, rocketNodeDepositLEB4.address, {from: owner});

            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Signal wanting to reduce
            await rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '8'.ether, {from: node});
            await increaseTime(web3, bondReductionWindowStart + 1);
            // Reduction from 16 ETH to 8 ETH should be valid
            await reduceBond(stakingMinipool, {from: node});

            // Increase
            await increaseTime(web3, rewardClaimPeriodTime + 1);

            // Signal wanting to reduce again
            await rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '4'.ether, {from: node});
            await increaseTime(web3, bondReductionWindowStart + 1);
            // Reduction from 16 ETH to 8 ETH should be valid
            await reduceBond(stakingMinipool, {from: node});
        });


        it(printTitle('node operator', 'can not reduce bond amount to a valid deposit amount within reward period'), async () => {
            // Upgrade RocketNodeDeposit to add 4 ETH LEB support
            const RocketNodeDepositLEB4 = artifacts.require('RocketNodeDepositLEB4.sol');
            const rocketNodeDepositLEB4 = await RocketNodeDepositLEB4.deployed();
            await setDaoNodeTrustedBootstrapUpgrade("upgradeContract", "rocketNodeDeposit", RocketNodeDepositLEB4.abi, rocketNodeDepositLEB4.address, {from: owner});

            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Signal wanting to reduce
            await rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '8'.ether, {from: node});
            await increaseTime(web3, bondReductionWindowStart + 1);
            // Reduction from 16 ETH to 8 ETH should be valid
            await reduceBond(stakingMinipool, {from: node});

            // Signal wanting to reduce again
            await shouldRevert(rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '4'.ether, {from: node}), 'Was able to reduce without waiting', 'Not enough time has passed since last bond reduction');
        });


        it(printTitle('node operator', 'cannot reduce bond without waiting'), async () => {
            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Signal wanting to reduce and wait 7 days
            await rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '8'.ether, {from: node});
            // Reduction from 16 ETH to 8 ETH should be valid
            await shouldRevert(reduceBond(stakingMinipool, {from: node}), 'Was able to reduce bond without waiting', 'Wait period not satisfied');
        });


        it(printTitle('node operator', 'cannot begin to reduce bond after odao has cancelled'), async () => {
            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Vote to cancel
            await rocketMinipoolBondReducer.voteCancelReduction(stakingMinipool.address, {from: trustedNode});
            // Signal wanting to reduce and wait 7 days
            await shouldRevert(rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '8'.ether, {from: node}), 'Was able to begin to reduce bond', 'This minipool is not allowed to reduce bond');
        });


        it(printTitle('node operator', 'cannot reduce bond after odao has cancelled'), async () => {
            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Signal wanting to reduce and wait 7 days
            await rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '8'.ether, {from: node});
            await increaseTime(web3, bondReductionWindowStart + 1);
            // Vote to cancel
            await rocketMinipoolBondReducer.voteCancelReduction(stakingMinipool.address, {from: trustedNode});
            // Wait and try to reduce
            await shouldRevert(reduceBond(stakingMinipool, {from: node}), 'Was able to reduce bond after it was cancelled', 'This minipool is not allowed to reduce bond');
        });


        it(printTitle('node operator', 'cannot reduce bond if wait period exceeds the limit'), async () => {
            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Signal wanting to reduce and wait 7 days
            await rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '8'.ether, {from: node});
            await increaseTime(web3, bondReductionWindowStart + bondReductionWindowLength + 1);
            // Reduction from 16 ETH to 8 ETH should be valid
            await shouldRevert(reduceBond(stakingMinipool, {from: node}), 'Was able to reduce bond without waiting', 'Wait period not satisfied');
        });


        it(printTitle('node operator', 'cannot reduce bond without beginning the process first'), async () => {
            // Reduction from 16 ETH to 8 ETH should be valid
            await shouldRevert(reduceBond(stakingMinipool, {from: node}), 'Was able to reduce bond without beginning the process', 'Wait period not satisfied');
        });


        it(printTitle('node operator', 'cannot reduce bond amount to an invalid deposit amount'), async () => {
            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Reduce to 9 ether bond should fail
            await shouldRevert(rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '9'.ether, {from: node}), 'Was able to reduce to invalid bond', 'Invalid bond amount');
        });


        it(printTitle('node operator', 'cannot increase bond amount'), async () => {
            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Signal wanting to reduce and wait 7 days
            await shouldRevert(rocketMinipoolBondReducer.beginReduceBondAmount(stakingMinipool.address, '18'.ether, {from: node}), 'Was able to increase bond', 'Invalid bond amount');
        });


        it(printTitle('node operator', 'cannot reduce bond amount while in invalid state'), async () => {
            // Get contracts
            const rocketMinipoolBondReducer = await RocketMinipoolBondReducer.deployed();
            // Signal wanting to reduce and wait 7 days
            await shouldRevert(rocketMinipoolBondReducer.beginReduceBondAmount(prelaunchMinipool.address, '8'.ether, {from: node}), 'Was able to begin reducing bond on a prelaunch minipool', 'Minipool must be staking');
            await shouldRevert(rocketMinipoolBondReducer.beginReduceBondAmount(initialisedMinipool.address, '8'.ether, {from: node}), 'Was able to reduce bond on an initialised minipool', 'Minipool must be staking');
            await increaseTime(web3, bondReductionWindowStart + 1);
        });


        //
        // Misc checks
        //


        it(printTitle('node operator', 'cannot promote a non-vacant minipool'), async () => {
            // Try to promote (and fail)
            await shouldRevert(promoteMinipool(prelaunchMinipool, {from: node}), 'Was able to promote non-vacant minipool', 'Cannot promote a non-vacant minipool');
            await shouldRevert(promoteMinipool(stakingMinipool, {from: node}), 'Was able to promote non-vacant minipool', 'The minipool can only promote while in prelaunch');
            await shouldRevert(promoteMinipool(initialisedMinipool, {from: node}), 'Was able to promote non-vacant minipool', 'The minipool can only promote while in prelaunch');
            await shouldRevert(promoteMinipool(dissolvedMinipool, {from: node}), 'Was able to promote non-vacant minipool', 'The minipool can only promote while in prelaunch');
        });


        const average_fee_tests = [
            [
                {
                    fee: '0.10',
                    amount: lebDepositNodeAmount,
                    expectedFee: '0.10'
                },
                {
                    fee: '0.10',
                    amount: lebDepositNodeAmount,
                    expectedFee: '0.10'
                },
                {
                    fee: '0.10',
                    amount: halfDepositNodeAmount,
                    expectedFee: '0.10'
                },
            ],
            [
                {
                    fee: '0.10',
                    amount: halfDepositNodeAmount,
                    expectedFee: '0.10'
                },
                {
                    fee: '0.20',
                    amount: lebDepositNodeAmount,
                    expectedFee: '0.16'
                },
                {
                    fee: '0.20',
                    amount: lebDepositNodeAmount,
                    expectedFee: '0.175'
                },
            ],
        ]

        for (let i = 0; i < average_fee_tests.length; i++) {
            let test = average_fee_tests[i];

            it(printTitle('node operator', 'has correct average node fee #' + (i+1)), async () => {

                async function setNetworkNodeFee(fee) {
                    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', fee, {from: owner});
                    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', fee, {from: owner});
                    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', fee, {from: owner});
                }

                // Stake RPL to cover minipools
                let minipoolRplStake = await getMinipoolMinimumRPLStake();
                let rplStake = minipoolRplStake.mul('10'.BN);
                await mintRPL(owner, emptyNode, rplStake);
                await nodeStakeRPL(rplStake, {from: emptyNode});

                for (const step of test) {
                    // Set fee to 10%
                    await setNetworkNodeFee(web3.utils.toWei(step.fee, 'ether'));

                    // Deposit
                    let minipool = await createMinipool({from: emptyNode, value: step.amount});
                    await userDeposit({ from: random, value: '32'.ether, });

                    // Wait required scrub period
                    await increaseTime(web3, scrubPeriod + 1);

                    // Progress minipools into desired statuses
                    await stakeMinipool(minipool, {from: emptyNode});

                    // Get average
                    let average = await getNodeAverageFee(emptyNode);
                    assertBN.equal(average, web3.utils.toWei(step.expectedFee, 'ether'), "Invalid average fee");
                }
            });
        }
    });
}
